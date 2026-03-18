import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  // body.lines: [{ id: string, qty_received: number }]
  const { lines } = body;

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
  }

  // Snapshot old qty_received before updating (for inventory delta calculation)
  const lineIds = lines.map((l: { id: string }) => l.id).filter(Boolean);
  const { data: oldLines } = await supabase
    .from('po_lines')
    .select('id, name, part_number, qty_received')
    .eq('purchase_order_id', id)
    .in('id', lineIds);

  const oldQtyMap = new Map<string, { qty_received: number; name: string; part_number: string | null }>();
  if (oldLines) {
    for (const ol of oldLines) {
      oldQtyMap.set(ol.id, { qty_received: ol.qty_received ?? 0, name: ol.name, part_number: ol.part_number });
    }
  }

  // Update each line's qty_received
  for (const line of lines) {
    if (!line.id || line.qty_received == null) continue;

    const { error } = await supabase
      .from('po_lines')
      .update({ qty_received: line.qty_received })
      .eq('id', line.id)
      .eq('purchase_order_id', id);

    if (error) {
      return internalError(error);
    }
  }

  // Update parts_inventory qty_on_hand by the delta received (best-effort)
  try {
    for (const line of lines) {
      if (!line.id || line.qty_received == null) continue;
      const old = oldQtyMap.get(line.id);
      if (!old) continue;
      const delta = line.qty_received - old.qty_received;
      if (delta <= 0) continue;

      // Match inventory by part_number first, then by name
      let matched = false;
      if (old.part_number) {
        const { data: inv } = await supabase
          .from('parts_inventory')
          .select('id')
          .eq('part_number', old.part_number)
          .limit(1)
          .single();

        if (inv) {
          await supabase.rpc('increment_inventory_qty', { p_id: inv.id, p_delta: delta });
          matched = true;
        }
      }

      if (!matched && old.name) {
        const { data: inv } = await supabase
          .from('parts_inventory')
          .select('id')
          .ilike('name', old.name)
          .limit(1)
          .single();

        if (inv) {
          await supabase.rpc('increment_inventory_qty', { p_id: inv.id, p_delta: delta });
        }
      }
    }
  } catch {
    // Best-effort inventory sync
  }

  // Re-fetch all lines to determine PO status
  const { data: allLines, error: linesError } = await supabase
    .from('po_lines')
    .select('qty_ordered, qty_received')
    .eq('purchase_order_id', id);

  if (linesError) {
    return internalError(linesError);
  }

  const allReceived = allLines.every(l => l.qty_received >= l.qty_ordered);
  const anyReceived = allLines.some(l => l.qty_received > 0);

  let newStatus: string;
  if (allReceived) {
    newStatus = 'received';
  } else if (anyReceived) {
    newStatus = 'partially_received';
  } else {
    newStatus = 'ordered';
  }

  const statusUpdate: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'received') {
    statusUpdate.received_at = new Date().toISOString();
  }

  await supabase
    .from('purchase_orders')
    .update(statusUpdate)
    .eq('id', id);

  // Update unit_cost on linked wo_parts_lines (best-effort)
  try {
    const { data: poLines } = await supabase
      .from('po_lines')
      .select('wo_parts_line_id, unit_cost')
      .eq('purchase_order_id', id)
      .not('wo_parts_line_id', 'is', null);

    if (poLines) {
      for (const pl of poLines) {
        if (pl.wo_parts_line_id) {
          await supabase
            .from('wo_parts_lines')
            .update({ unit_cost: pl.unit_cost })
            .eq('id', pl.wo_parts_line_id);
        }
      }
    }
  } catch {
    // Best-effort cost sync
  }

  // Return updated PO
  const { data: full, error: fullError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      vendor:vendors(id, name, contact_name, email, phone, account_number),
      work_order:work_orders(id, display_id, job),
      po_lines(id, name, part_number, qty_ordered, qty_received, unit_cost, sort_order, wo_parts_line_id)
    `)
    .eq('id', id)
    .single();

  if (fullError) {
    return internalError(fullError);
  }

  const enrichedLines = (full.po_lines as { qty_ordered: number; qty_received: number; unit_cost: number }[]) || [];
  const total_cost = enrichedLines.reduce((sum, l) => sum + l.qty_ordered * Number(l.unit_cost), 0);

  return NextResponse.json({
    ...full,
    lines: enrichedLines,
    line_count: enrichedLines.length,
    total_cost: Math.round(total_cost * 100) / 100,
  });
}
