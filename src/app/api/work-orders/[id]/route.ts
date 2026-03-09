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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, mileage, plate),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('id', id)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(computeTotals(data));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  const allowedFields = ['status', 'tech_id', 'notes', 'priority'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('work_orders')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order)
    `)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(computeTotals(data));
}
