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

  return NextResponse.json(data, { status: 201 });
}
