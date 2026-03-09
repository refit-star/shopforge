import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

function computeTotals(wo: Record<string, unknown>) {
  const laborLines = (wo.wo_labor_lines as { hours: number; rate: number }[]) || [];
  const partsLines = (wo.wo_parts_lines as { qty: number; price: number }[]) || [];

  const labor_total = laborLines.reduce((sum, l) => sum + Number(l.hours) * Number(l.rate), 0);
  const parts_total = partsLines.reduce((sum, p) => sum + Number(p.qty) * Number(p.price), 0);
  const labor_hours = laborLines.reduce((sum, l) => sum + Number(l.hours), 0);

  return {
    ...wo,
    labor_lines: laborLines,
    parts_lines: partsLines,
    labor_total: Math.round(labor_total * 100) / 100,
    parts_total: Math.round(parts_total * 100) / 100,
    estimated_total: Math.round((labor_total + parts_total) * 100) / 100,
    labor_hours: Math.round(labor_hours * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const status = req.nextUrl.searchParams.get('status');

  let query = supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order)
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (data || []).map(computeTotals);
  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { customer_id, vehicle_id, tech_id, job, priority, notes, labor, parts } = body;

  if (!customer_id || !vehicle_id || !job) {
    return NextResponse.json(
      { error: 'customer_id, vehicle_id, and job are required' },
      { status: 400 }
    );
  }

  // Generate display_id
  const { data: idResult, error: idError } = await supabase.rpc('next_wo_id');
  if (idError) {
    return NextResponse.json({ error: idError.message }, { status: 500 });
  }

  const display_id = idResult as string;

  // Insert work order
  const { data: wo, error: woError } = await supabase
    .from('work_orders')
    .insert({
      display_id,
      customer_id,
      vehicle_id,
      tech_id: tech_id || null,
      job,
      priority: priority || 'low',
      notes: notes || null,
    })
    .select()
    .single();

  if (woError) {
    return NextResponse.json({ error: woError.message }, { status: 500 });
  }

  // Insert labor lines
  if (labor && labor.length > 0) {
    const laborRows = labor.map((l: { description: string; hours: number; rate: number }, i: number) => ({
      work_order_id: wo.id,
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      sort_order: i,
    }));

    const { error: laborError } = await supabase
      .from('wo_labor_lines')
      .insert(laborRows);

    if (laborError) {
      return NextResponse.json({ error: laborError.message }, { status: 500 });
    }
  }

  // Insert parts lines
  if (parts && parts.length > 0) {
    const partsRows = parts.map((p: { name: string; qty: number; price: number }, i: number) => ({
      work_order_id: wo.id,
      name: p.name,
      qty: p.qty,
      price: p.price,
      sort_order: i,
    }));

    const { error: partsError } = await supabase
      .from('wo_parts_lines')
      .insert(partsRows);

    if (partsError) {
      return NextResponse.json({ error: partsError.message }, { status: 500 });
    }
  }

  // Return the full WO with joins
  const { data: full, error: fullError } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('id', wo.id)
    .single();

  if (fullError) {
    return NextResponse.json({ error: fullError.message }, { status: 500 });
  }

  return NextResponse.json(computeTotals(full), { status: 201 });
}
