import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings } from '@/lib/settings-server';

// GET /api/appointments/[id]/reminder — check reminder status
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('appointment_id', id)
    .eq('type', 'appointment_reminder')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ has_reminder: false, reminder: null });
  }

  return NextResponse.json({ has_reminder: true, reminder: data });
}

// POST /api/appointments/[id]/reminder — manually trigger/create a reminder
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const action = body.action; // 'send' to mark as sent, undefined to create new

  // Check for existing reminder
  const { data: existing } = await supabase
    .from('notifications')
    .select('*')
    .eq('appointment_id', id)
    .eq('type', 'appointment_reminder')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (action === 'send') {
    // Send the existing reminder (update status to sent)
    if (!existing) {
      return NextResponse.json({ error: 'No reminder found to send' }, { status: 404 });
    }

    // Fetch customer phone number
    const { data: customer } = await supabase
      .from('customers')
      .select('phone')
      .eq('id', existing.customer_id)
      .single();

    if (!customer?.phone) {
      return NextResponse.json({ error: 'Customer has no phone number on file' }, { status: 400 });
    }

    // Try to actually send the SMS via Twilio
    const settings = await getFullSettings();
    if (settings?.twilio_account_sid && settings?.twilio_auth_token && settings?.twilio_phone_number) {
      try {
        const credentials = Buffer.from(
          `${settings.twilio_account_sid}:${settings.twilio_auth_token}`
        ).toString('base64');

        const params = new URLSearchParams();
        params.append('From', settings.twilio_phone_number);
        params.append('To', customer.phone);
        params.append('Body', existing.message);

        const smsRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_account_sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );

        const smsData = await smsRes.json();

        if (!smsRes.ok) {
          return NextResponse.json(
            { error: `SMS failed: ${smsData.message || smsData.more_info || 'Twilio error'}` },
            { status: 400 }
          );
        }

        // Log outbound message to sms_messages
        await supabase.from('sms_messages').insert({
          customer_id: existing.customer_id,
          direction: 'outbound',
          phone_number: customer.phone,
          body: existing.message,
          twilio_message_sid: smsData.sid,
        });
      } catch (err) {
        return NextResponse.json(
          { error: 'SMS send failed: ' + (err instanceof Error ? err.message : 'Unknown error') },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'SMS not configured \u2014 add your Twilio credentials in Settings > Integrations' },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ has_reminder: true, reminder: updated });
  }

  // Create new reminder if none exists
  if (existing) {
    return NextResponse.json({ has_reminder: true, reminder: existing });
  }

  // Fetch the appointment to build the message
  const { data: appt, error: apptError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (apptError || !appt) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  const apptDate = new Date(appt.start_time);
  const dateStr = apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const h = apptDate.getUTCHours();
  const m = apptDate.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const timeStr = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;

  const { data: newReminder, error: insertError } = await supabase
    .from('notifications')
    .insert({
      appointment_id: id,
      customer_id: appt.customer_id,
      type: 'appointment_reminder',
      channel: 'sms',
      message: `Reminder: You have a service appointment on ${dateStr} at ${timeStr} for ${appt.job}. Please arrive 10 minutes early.`,
      status: 'pending',
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ has_reminder: true, reminder: newReminder }, { status: 201 });
}

// DELETE /api/appointments/[id]/reminder — cancel a reminder
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('appointment_id', id)
    .eq('type', 'appointment_reminder')
    .eq('status', 'pending')
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'No pending reminder found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('notifications')
    .update({ status: 'cancelled' })
    .eq('id', existing.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ has_reminder: false, cancelled: true });
}
