import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // 1. Fetch the appointment
  const { data: appt, error: apptError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (apptError || !appt) {
    return NextResponse.json(
      { error: 'Appointment not found' },
      { status: 404 }
    );
  }

  // 2. Look for an existing Scheduled work order matching customer + vehicle
  let woId: string | null = null;

  if (appt.vehicle_id) {
    const { data: existingWO } = await supabase
      .from('work_orders')
      .select('id')
      .eq('customer_id', appt.customer_id)
      .eq('vehicle_id', appt.vehicle_id)
      .eq('status', 'Scheduled')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingWO) {
      woId = existingWO.id;
    }
  }

  if (woId) {
    // 3a. Update existing WO to Check-In
    const { error: updateErr } = await supabase
      .from('work_orders')
      .update({ status: 'Check-In' })
      .eq('id', woId);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message },
        { status: 500 }
      );
    }

    // Create status-change notification
    await supabase.from('notifications').insert({
      work_order_id: woId,
      customer_id: appt.customer_id,
      type: 'status_change',
      channel: 'sms',
      message: 'Your vehicle has been checked in.',
    });

    return NextResponse.json({ work_order_id: woId, created: false });
  } else {
    // 3b. Create a new work order with Check-In status
    if (!appt.vehicle_id) {
      return NextResponse.json(
        { error: 'Appointment has no vehicle — cannot create a work order without a vehicle.' },
        { status: 400 }
      );
    }

    // Generate display_id
    const { data: idResult, error: idError } = await supabase.rpc('next_wo_id');
    if (idError) {
      return NextResponse.json({ error: idError.message }, { status: 500 });
    }

    const display_id = idResult as string;

    const { data: newWO, error: woError } = await supabase
      .from('work_orders')
      .insert({
        display_id,
        customer_id: appt.customer_id,
        vehicle_id: appt.vehicle_id,
        tech_id: appt.tech_id || null,
        job: appt.job,
        status: 'Check-In',
        priority: 'low',
        notes: null,
      })
      .select()
      .single();

    if (woError) {
      return NextResponse.json({ error: woError.message }, { status: 500 });
    }

    // Create status-change notification
    await supabase.from('notifications').insert({
      work_order_id: newWO.id,
      customer_id: appt.customer_id,
      type: 'status_change',
      channel: 'sms',
      message: 'Your vehicle has been checked in.',
    });

    return NextResponse.json(
      { work_order_id: newWO.id, created: true },
      { status: 201 }
    );
  }
}
