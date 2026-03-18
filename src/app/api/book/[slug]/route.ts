import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/phone';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const supabase = createAdminClient();
  const body = await req.json();
  const { name, phone, email, service_id, start_time, notes, vehicle_year, vehicle_make, vehicle_model } = body;

  if (!name || (!phone && !email) || !service_id || !start_time) {
    return NextResponse.json(
      { error: 'name, phone or email, service_id, and start_time are required' },
      { status: 400 }
    );
  }

  // Resolve shop
  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, online_booking_enabled, hours_start, hours_end, booking_lead_hours, booking_window_days, twilio_phone_number')
    .eq('slug', params.slug)
    .single();

  // Fetch Twilio secrets for SMS confirmation (per-shop override or platform fallback)
  const shopSecretsRaw = shop ? (await supabase.from('shop_secrets').select('twilio_account_sid, twilio_auth_token').eq('shop_id', shop.id).single()).data : null;
  const twilioSid = shopSecretsRaw?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioToken = shopSecretsRaw?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || '';
  const shopSecrets = (twilioSid && twilioToken) ? { twilio_account_sid: twilioSid, twilio_auth_token: twilioToken } : null;

  if (!shop || !shop.online_booking_enabled) {
    return NextResponse.json({ error: 'Online booking is not available' }, { status: 404 });
  }

  // Enforce booking_window_days server-side
  const slotDateStr = start_time.slice(0, 10);
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const requestedMs = Date.UTC(
    parseInt(slotDateStr.slice(0, 4)),
    parseInt(slotDateStr.slice(5, 7)) - 1,
    parseInt(slotDateStr.slice(8, 10))
  );
  const windowDays = shop.booking_window_days ?? 14;

  if (requestedMs < todayMs) {
    return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 });
  }
  if (Math.floor((requestedMs - todayMs) / (1000 * 60 * 60 * 24)) >= windowDays) {
    return NextResponse.json({ error: `Bookings are only available up to ${windowDays} days in advance` }, { status: 400 });
  }

  // Spam protection: max 5 online bookings per phone number per day
  if (phone) {
    const normalized = normalizePhone(phone);
    const { data: phoneCustomers } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('shop_id', shop.id);

    const matchingIds = (phoneCustomers || [])
      .filter(c => c.phone && normalizePhone(c.phone) === normalized)
      .map(c => c.id);

    if (matchingIds.length > 0) {
      const spamDayStart = new Date(todayMs).toISOString();
      const spamDayEnd = new Date(todayMs + 86400000).toISOString();
      const { count: phoneBookings } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shop.id)
        .eq('source', 'online')
        .in('customer_id', matchingIds)
        .gte('created_at', spamDayStart)
        .lte('created_at', spamDayEnd);

      if ((phoneBookings ?? 0) >= 5) {
        return NextResponse.json(
          { error: 'Maximum bookings per day reached. Please call the shop to book additional appointments.' },
          { status: 429 }
        );
      }
    }
  }

  // Fetch the canned job to get name + duration
  const { data: service } = await supabase
    .from('canned_jobs')
    .select('id, name, duration_minutes')
    .eq('id', service_id)
    .eq('shop_id', shop.id)
    .eq('bookable', true)
    .single();

  if (!service) {
    return NextResponse.json({ error: 'Service not found' }, { status: 400 });
  }

  // Re-check availability to prevent race conditions
  const slotDate = start_time.slice(0, 10);
  const dayStart = `${slotDate}T00:00:00.000Z`;
  const dayEnd = `${slotDate}T23:59:59.999Z`;

  const { data: existing } = await supabase
    .from('appointments')
    .select('start_time, duration_minutes')
    .eq('shop_id', shop.id)
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);

  const slotStart = new Date(start_time);
  const slotStartMin = slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();
  const slotEndMin = slotStartMin + service.duration_minutes;

  const conflict = (existing || []).some(a => {
    const d = new Date(a.start_time);
    const aStart = d.getUTCHours() * 60 + d.getUTCMinutes();
    const aEnd = aStart + a.duration_minutes;
    return slotStartMin < aEnd && slotEndMin > aStart;
  });

  if (conflict) {
    return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 });
  }

  // Customer matching: by normalized phone first, then email
  let customerId: string | null = null;

  if (phone) {
    const normalized = normalizePhone(phone);
    // Search all customers for this shop with matching normalized phone
    const { data: phoneMatches } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('shop_id', shop.id);

    if (phoneMatches) {
      const match = phoneMatches.find(c => c.phone && normalizePhone(c.phone) === normalized);
      if (match) customerId = match.id;
    }
  }

  if (!customerId && email) {
    const { data: emailMatch } = await supabase
      .from('customers')
      .select('id')
      .eq('shop_id', shop.id)
      .ilike('email', email.trim())
      .limit(1)
      .single();

    if (emailMatch) customerId = emailMatch.id;
  }

  // Create customer if not found
  if (!customerId) {
    const { data: newCustomer, error: custErr } = await supabase
      .from('customers')
      .insert({
        shop_id: shop.id,
        name: name.trim(),
        phone: phone ? phone.trim() : null,
        email: email ? email.trim() : null,
      })
      .select('id')
      .single();

    if (custErr || !newCustomer) {
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }
    customerId = newCustomer.id;
  }

  // Create vehicle if info provided
  let vehicleId: string | null = null;
  if (vehicle_make && vehicle_model) {
    const { data: newVehicle } = await supabase
      .from('vehicles')
      .insert({
        shop_id: shop.id,
        customer_id: customerId,
        year: vehicle_year ? parseInt(vehicle_year, 10) : null,
        make: vehicle_make.trim(),
        model: vehicle_model.trim(),
      })
      .select('id')
      .single();

    if (newVehicle) vehicleId = newVehicle.id;
  }

  // Create appointment
  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      shop_id: shop.id,
      customer_id: customerId,
      vehicle_id: vehicleId,
      job: service.name,
      start_time,
      duration_minutes: service.duration_minutes,
      notes: notes || null,
      source: 'online',
    })
    .select('id')
    .single();

  if (apptErr || !appointment) {
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  }

  // Format time for notifications
  const apptDate = new Date(start_time);
  const dateStr = apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const h = apptDate.getUTCHours();
  const m = apptDate.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const timeStr = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;

  // Create pending reminder notification
  await supabase.from('notifications').insert({
    shop_id: shop.id,
    appointment_id: appointment.id,
    customer_id: customerId,
    type: 'appointment_reminder',
    channel: 'sms',
    message: `Reminder: You have a service appointment on ${dateStr} at ${timeStr} for ${service.name}. Please arrive 10 minutes early.`,
    status: 'pending',
  });

  // Create dashboard notification for the shop
  await supabase.from('notifications').insert({
    shop_id: shop.id,
    appointment_id: appointment.id,
    customer_id: customerId,
    type: 'online_booking',
    channel: 'dashboard',
    message: `New online booking from ${name.trim()} for ${service.name} on ${dateStr} at ${timeStr}.`,
    status: 'sent',
  });

  // Send confirmation SMS if Twilio is configured (best-effort)
  if (phone && shopSecrets?.twilio_account_sid && shopSecrets?.twilio_auth_token && shop.twilio_phone_number) {
    const confirmMsg = `Your appointment at ${shop.name} for ${service.name} is confirmed for ${dateStr} at ${timeStr}. Please arrive 10 minutes early.`;

    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${shopSecrets.twilio_account_sid}/Messages.json`;
      const auth = Buffer.from(`${shopSecrets.twilio_account_sid}:${shopSecrets.twilio_auth_token}`).toString('base64');

      const formData = new URLSearchParams();
      formData.append('From', shop.twilio_phone_number);
      formData.append('To', phone.trim().startsWith('+') ? phone.trim() : `+1${normalizePhone(phone)}`);
      formData.append('Body', confirmMsg);

      const twilioRes = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (twilioRes.ok) {
        const twilioData = await twilioRes.json();
        await supabase.from('sms_messages').insert({
          shop_id: shop.id,
          customer_id: customerId,
          direction: 'outbound',
          phone_number: phone.trim(),
          body: confirmMsg,
          twilio_message_sid: twilioData.sid || null,
        });
      }
    } catch {
      // Best-effort — don't block booking on SMS failure
    }
  }

  return NextResponse.json({
    success: true,
    appointment_id: appointment.id,
    service: service.name,
    date: dateStr,
    time: timeStr,
  }, { status: 201 });
}
