import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

function enrichPO(po: Record<string, unknown>) {
  const lines = (po.po_lines as { qty_ordered: number; qty_received: number; unit_cost: number }[]) || [];
  const total_cost = lines.reduce((sum, l) => sum + l.qty_ordered * Number(l.unit_cost), 0);
  return {
    ...po,
    lines,
    line_count: lines.length,
    total_cost: Math.round(total_cost * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const status = req.nextUrl.searchParams.get('status');
  const vendorId = req.nextUrl.searchParams.get('vendor_id');
  const workOrderId = req.nextUrl.searchParams.get('work_order_id');

  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name),
      work_order:work_orders(id, display_id, job),
      po_lines(id, name, part_number, qty_ordered, qty_received, unit_cost, sort_order, wo_parts_line_id)
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }
  if (vendorId) {
    query = query.eq('vendor_id', vendorId);
  }
  if (workOrderId) {
    query = query.eq('work_order_id', workOrderId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json((data || []).map(enrichPO));
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { vendor_id, work_order_id, notes, lines } = body;

  // Generate display_id
  const { data: idResult, error: idError } = await supabase.rpc('next_po_id');
  if (idError) {
    return NextResponse.json({ error: idError.message }, { status: 500 });
  }

  const display_id = idResult as string;

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      display_id,
      vendor_id: vendor_id || null,
      work_order_id: work_order_id || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (poError) {
    return NextResponse.json({ error: poError.message }, { status: 500 });
  }

  // Insert lines
  if (lines && lines.length > 0) {
    const rows = lines.map((l: { name: string; part_number?: string; qty_ordered?: number; unit_cost?: number; wo_parts_line_id?: string }, i: number) => ({
      purchase_order_id: po.id,
      name: l.name,
      part_number: l.part_number || null,
      qty_ordered: l.qty_ordered || 1,
      unit_cost: l.unit_cost || 0,
      sort_order: i,
      wo_parts_line_id: l.wo_parts_line_id || null,
    }));

    const { error: linesError } = await supabase.from('po_lines').insert(rows);
    if (linesError) {
      return NextResponse.json({ error: linesError.message }, { status: 500 });
    }
  }

  // Return full PO
  const { data: full, error: fullError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name),
      work_order:work_orders(id, display_id, job),
      po_lines(id, name, part_number, qty_ordered, qty_received, unit_cost, sort_order, wo_parts_line_id)
    `)
    .eq('id', po.id)
    .single();

  if (fullError) {
    return NextResponse.json({ error: fullError.message }, { status: 500 });
  }

  return NextResponse.json(enrichPO(full), { status: 201 });
}
