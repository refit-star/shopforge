import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

const SELECT_WITH_JOINS = `
  *,
  customer:customers(id, name, phone, email),
  vehicle:vehicles(id, year, make, model, vin, plate),
  estimate_labor_lines(id, description, hours, rate, sort_order),
  estimate_parts_lines(id, name, qty, price, sort_order)
`;

function computeTotals(est: Record<string, unknown>) {
  const laborLines = (est.estimate_labor_lines as { hours: number; rate: number }[]) || [];
  const partsLines = (est.estimate_parts_lines as { qty: number; price: number }[]) || [];

  const labor_total = laborLines.reduce((sum, l) => sum + Number(l.hours) * Number(l.rate), 0);
  const parts_total = partsLines.reduce((sum, p) => sum + Number(p.qty) * Number(p.price), 0);

  return {
    ...est,
    labor_lines: laborLines,
    parts_lines: partsLines,
    labor_total: Math.round(labor_total * 100) / 100,
    parts_total: Math.round(parts_total * 100) / 100,
    estimated_total: Math.round((labor_total + parts_total) * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('estimates')
    .select(SELECT_WITH_JOINS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return internalError(error);
  }

  const enriched = (data || []).map(computeTotals);
  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { customer_id, vehicle_id, job, notes, valid_until, labor, parts } = body;

  if (!customer_id || !vehicle_id || !job) {
    return NextResponse.json(
      { error: 'customer_id, vehicle_id, and job are required' },
      { status: 400 }
    );
  }

  // Generate display_id
  const { data: idResult, error: idError } = await supabase.rpc('next_est_id');
  if (idError) {
    return internalError(idError);
  }

  const display_id = idResult as string;

  // Insert estimate
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .insert({
      display_id,
      customer_id,
      vehicle_id,
      job,
      notes: notes || null,
      valid_until: valid_until || null,
    })
    .select()
    .single();

  if (estError) {
    return internalError(estError);
  }

  // Insert labor lines
  if (labor && labor.length > 0) {
    const laborRows = labor.map((l: { description: string; hours: number; rate: number }, i: number) => ({
      estimate_id: estimate.id,
      description: l.description,
      hours: l.hours,
      rate: l.rate,
      sort_order: i,
    }));

    const { error: laborError } = await supabase
      .from('estimate_labor_lines')
      .insert(laborRows);

    if (laborError) {
      return internalError(laborError);
    }
  }

  // Insert parts lines
  if (parts && parts.length > 0) {
    const partsRows = parts.map((p: { name: string; qty: number; price: number }, i: number) => ({
      estimate_id: estimate.id,
      name: p.name,
      qty: p.qty,
      price: p.price,
      sort_order: i,
    }));

    const { error: partsError } = await supabase
      .from('estimate_parts_lines')
      .insert(partsRows);

    if (partsError) {
      return internalError(partsError);
    }
  }

  // Return full estimate with joins
  const { data: full, error: fullError } = await supabase
    .from('estimates')
    .select(SELECT_WITH_JOINS)
    .eq('id', estimate.id)
    .single();

  if (fullError) {
    return internalError(fullError);
  }

  return NextResponse.json(computeTotals(full), { status: 201 });
}
