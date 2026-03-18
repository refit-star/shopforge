import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

// GET — all active time entries (open clock-ins) + optional ?tech_id= filter
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const techId = req.nextUrl.searchParams.get('tech_id');
  const type = req.nextUrl.searchParams.get('type');
  const active = req.nextUrl.searchParams.get('active');

  let query = supabase
    .from('time_entries')
    .select('*, tech:techs(id, name, color), work_order:work_orders(id, display_id, job)')
    .order('clock_in', { ascending: false });

  if (techId) query = query.eq('tech_id', techId);
  if (type) query = query.eq('type', type);
  if (active === 'true') query = query.is('clock_out', null);

  const { data, error } = await query.limit(200);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}

// POST — clock in (shift or job)
export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { tech_id, type, work_order_id, notes } = body;

  if (!tech_id || !type) {
    return NextResponse.json({ error: 'tech_id and type are required' }, { status: 400 });
  }

  if (type === 'job' && !work_order_id) {
    return NextResponse.json({ error: 'work_order_id is required for job entries' }, { status: 400 });
  }

  // Prevent double clock-in for shifts
  if (type === 'shift') {
    const { data: existing } = await supabase
      .from('time_entries')
      .select('id')
      .eq('tech_id', tech_id)
      .eq('type', 'shift')
      .is('clock_out', null)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Tech already has an active shift' }, { status: 409 });
    }
  }

  // Prevent duplicate job timer on same WO
  if (type === 'job' && work_order_id) {
    const { data: existing } = await supabase
      .from('time_entries')
      .select('id')
      .eq('tech_id', tech_id)
      .eq('type', 'job')
      .eq('work_order_id', work_order_id)
      .is('clock_out', null)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Tech already has an active timer on this work order' }, { status: 409 });
    }
  }

  const insert: Record<string, unknown> = { tech_id, type };
  if (work_order_id) insert.work_order_id = work_order_id;
  if (notes) insert.notes = notes;

  const { data, error } = await supabase
    .from('time_entries')
    .insert(insert)
    .select('*, tech:techs(id, name, color), work_order:work_orders(id, display_id, job)')
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
