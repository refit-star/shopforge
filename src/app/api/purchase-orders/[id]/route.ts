import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

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

async function fetchFull(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name, contact_name, email, phone, account_number),
      work_order:work_orders(id, display_id, job),
      po_lines(id, name, part_number, qty_ordered, qty_received, unit_cost, sort_order, wo_parts_line_id)
    `)
    .eq('id', id)
    .single();

  if (error) return { data: null, error };
  return { data: enrichPO(data), error: null };
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

  // Update PO fields
  const allowedFields = ['vendor_id', 'work_order_id', 'status', 'notes'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  // Set timestamps on status transitions
  if (body.status === 'ordered' && !('ordered_at' in updates)) {
    updates.ordered_at = new Date().toISOString();
  }
  if (body.status === 'received' && !('received_at' in updates)) {
    updates.received_at = new Date().toISOString();
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', id);

    if (error) {
      return internalError(error);
    }
  }

  // Replace lines if provided
  if ('lines' in body && Array.isArray(body.lines)) {
    await supabase.from('po_lines').delete().eq('purchase_order_id', id);

    if (body.lines.length > 0) {
      const rows = body.lines.map((l: { name: string; part_number?: string; qty_ordered?: number; qty_received?: number; unit_cost?: number; wo_parts_line_id?: string }, i: number) => ({
        purchase_order_id: id,
        name: l.name,
        part_number: l.part_number || null,
        qty_ordered: l.qty_ordered || 1,
        qty_received: l.qty_received || 0,
        unit_cost: l.unit_cost || 0,
        sort_order: i,
        wo_parts_line_id: l.wo_parts_line_id || null,
      }));

      const { error } = await supabase.from('po_lines').insert(rows);
      if (error) {
        return internalError(error);
      }
    }
  }

  const { data, error } = await fetchFull(supabase, id);

  if (error) {
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

  // Only allow deleting draft POs
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', id)
    .single();

  if (po && po.status !== 'draft') {
    return NextResponse.json(
      { error: 'Only draft purchase orders can be deleted' },
      { status: 400 }
    );
  }

  // Lines cascade-delete via FK
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ success: true });
}
