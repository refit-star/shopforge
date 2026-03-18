import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name),
      po_lines(id, name, part_number, qty_ordered, qty_received, unit_cost, sort_order)
    `)
    .eq('work_order_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return internalError(error);
  }

  const enriched = (data || []).map(po => {
    const lines = (po.po_lines as { qty_ordered: number; qty_received: number; unit_cost: number }[]) || [];
    const total_cost = lines.reduce((sum, l) => sum + l.qty_ordered * Number(l.unit_cost), 0);
    return {
      ...po,
      lines,
      line_count: lines.length,
      total_cost: Math.round(total_cost * 100) / 100,
    };
  });

  return NextResponse.json(enriched);
}
