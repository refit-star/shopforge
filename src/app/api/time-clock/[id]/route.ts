import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// PATCH — clock out, clock in edit, or update notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};

  // Get existing entry for validation
  const { data: existing } = await supabase
    .from('time_entries')
    .select('clock_in, clock_out')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  // Prevent editing a running timer (no clock_out yet)
  if (!existing.clock_out && ('clock_in' in body || 'notes' in body) && !('clock_out' in body)) {
    return NextResponse.json({ error: 'Cannot edit a running timer.' }, { status: 400 });
  }

  if ('clock_in' in body) {
    updates.clock_in = body.clock_in;
  }

  if ('clock_out' in body) {
    if (body.clock_out === null) {
      updates.clock_out = null;
      updates.duration_minutes = null;
    } else {
      updates.clock_out = body.clock_out || new Date().toISOString();
    }
  }

  if ('notes' in body) {
    updates.notes = body.notes;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Determine final clock_in and clock_out for duration calc and validation
  const finalClockIn = (updates.clock_in as string) || existing.clock_in;
  const finalClockOut = updates.clock_out === null ? null : (updates.clock_out as string) || existing.clock_out;

  // Validate clock_in is before clock_out
  if (finalClockIn && finalClockOut) {
    if (new Date(finalClockIn).getTime() >= new Date(finalClockOut).getTime()) {
      return NextResponse.json({ error: 'Clock-in must be before clock-out' }, { status: 400 });
    }
    // Recalculate duration
    updates.duration_minutes = Math.round(
      (new Date(finalClockOut).getTime() - new Date(finalClockIn).getTime()) / 60000
    );
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .select('*, tech:techs(id, name, color), work_order:work_orders(id, display_id, job)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
