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

async function fetchFull(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data, error } = await supabase
    .from('estimates')
    .select(SELECT_WITH_JOINS)
    .eq('id', id)
    .single();

  if (error) return { data: null, error };
  return { data: computeTotals(data), error: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await fetchFull(supabase, id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  // Update estimate fields
  const allowedFields = ['job', 'notes', 'status', 'valid_until'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('estimates')
      .update(updates)
      .eq('id', id);

    if (error) {
      return internalError(error);
    }
  }

  // Handle labor lines: replace all
  if ('labor_lines' in body && Array.isArray(body.labor_lines)) {
    await supabase.from('estimate_labor_lines').delete().eq('estimate_id', id);

    if (body.labor_lines.length > 0) {
      const rows = body.labor_lines.map((l: { description: string; hours: number; rate: number }, i: number) => ({
        estimate_id: id,
        description: l.description,
        hours: l.hours,
        rate: l.rate,
        sort_order: i,
      }));
      const { error } = await supabase.from('estimate_labor_lines').insert(rows);
      if (error) {
        return internalError(error);
      }
    }
  }

  // Handle parts lines: replace all
  if ('parts_lines' in body && Array.isArray(body.parts_lines)) {
    await supabase.from('estimate_parts_lines').delete().eq('estimate_id', id);

    if (body.parts_lines.length > 0) {
      const rows = body.parts_lines.map((p: { name: string; qty: number; price: number }, i: number) => ({
        estimate_id: id,
        name: p.name,
        qty: p.qty,
        price: p.price,
        sort_order: i,
      }));
      const { error } = await supabase.from('estimate_parts_lines').insert(rows);
      if (error) {
        return internalError(error);
      }
    }
  }

  // Return full updated estimate
  const { data, error } = await fetchFull(supabase, id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { error } = await supabase
    .from('estimates')
    .delete()
    .eq('id', id);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ ok: true });
}
