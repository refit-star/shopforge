import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { rows, mode } = await req.json() as {
    rows: Record<string, string>[];
    mode: 'skip' | 'update';
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Fetch existing parts for dedup by part_number
  const { data: existing } = await supabase
    .from('parts_inventory')
    .select('id, part_number')
    .eq('active', true);

  const byPartNum: Record<string, string> = {};
  for (const p of existing || []) {
    if (p.part_number) byPartNum[p.part_number.toLowerCase().trim()] = p.id;
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = r.name?.trim();
    if (!name) { errors.push({ row: i + 1, error: 'Missing part name' }); continue; }

    // Dedup by part_number
    const pn = r.part_number?.trim();
    const matchId = pn ? byPartNum[pn.toLowerCase()] : null;

    if (matchId) {
      if (mode === 'update') {
        toUpdate.push({
          id: matchId,
          data: {
            name,
            part_number: pn || null,
            category: r.category?.trim() || null,
            qty_on_hand: r.qty_on_hand ? parseInt(r.qty_on_hand, 10) || 0 : 0,
            cost: r.cost ? parseFloat(r.cost) || 0 : 0,
            price: r.price ? parseFloat(r.price) || 0 : 0,
          },
        });
      } else {
        skipped++;
      }
      continue;
    }

    toInsert.push({
      name,
      part_number: pn || null,
      category: r.category?.trim() || null,
      qty_on_hand: r.qty_on_hand ? parseInt(r.qty_on_hand, 10) || 0 : 0,
      cost: r.cost ? parseFloat(r.cost) || 0 : 0,
      price: r.price ? parseFloat(r.price) || 0 : 0,
      min_stock: 0,
    });
  }

  let imported = 0;
  let updated = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from('parts_inventory').insert(toInsert);
    if (error) {
      errors.push({ row: 0, error: `Batch insert failed: ${error.message}` });
    } else {
      imported = toInsert.length;
    }
  }

  for (const u of toUpdate) {
    const { error } = await supabase.from('parts_inventory').update(u.data).eq('id', u.id);
    if (error) {
      errors.push({ row: 0, error: `Update failed: ${error.message}` });
    } else {
      updated++;
    }
  }

  return NextResponse.json({ imported, updated, skipped, errors });
}
