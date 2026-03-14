import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const start = req.nextUrl.searchParams.get('start');
  const end = req.nextUrl.searchParams.get('end');

  let query = supabase
    .from('appointments')
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color)
    `)
    .order('start_time');

  if (start) {
    query = query.gte('start_time', start);
  }
  if (end) {
    query = query.lte('start_time', end);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach reminder status to each appointment
  if (data && data.length > 0) {
    const apptIds = data.map((a: { id: string }) => a.id);
    const { data: reminders } = await supabase
      .from('notifications')
      .select('appointment_id, status')
      .eq('type', 'appointment_reminder')
      .in('appointment_id', apptIds);

    const reminderMap = new Map<string, string>();
    if (reminders) {
      for (const r of reminders) {
        if (r.appointment_id) reminderMap.set(r.appointment_id, r.status);
      }
    }

    for (const appt of data) {
      (appt as Record<string, unknown>).has_reminder = reminderMap.has(appt.id);
      (appt as Record<string, unknown>).reminder_status = reminderMap.get(appt.id) || null;
    }
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { customer_id, vehicle_id, tech_id, job, start_time, duration_minutes, notes } = body;

  if (!customer_id || !job || !start_time || !duration_minutes) {
    return NextResponse.json(
      { error: 'customer_id, job, start_time, and duration_minutes are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert({
      customer_id,
      vehicle_id: vehicle_id || null,
      tech_id: tech_id || null,
      job,
      start_time,
      duration_minutes,
      notes: notes || null,
    })
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create appointment reminder notification
  if (data) {
    const apptDate = new Date(start_time);
    const dateStr = apptDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const h = apptDate.getUTCHours();
    const m = apptDate.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const timeStr = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;

    await supabase.from('notifications').insert({
      appointment_id: data.id,
      customer_id,
      type: 'appointment_reminder',
      channel: 'sms',
      message: `Reminder: You have a service appointment on ${dateStr} at ${timeStr} for ${job}. Please arrive 10 minutes early.`,
      status: 'pending',
    });

    data.has_reminder = true;
  }

  return NextResponse.json(data, { status: 201 });
}
