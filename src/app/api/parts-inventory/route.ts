import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const q = req.nextUrl.searchParams.get('q');

  let query = supabase
    .from('parts_inventory')
    .select('*, vendor:vendors(id, name)')
    .eq('active', true)
    .order('name');

  if (q) {
    query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);
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

  const { name, part_number, category, qty_on_hand, cost, price, min_stock, vendor_id } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('parts_inventory')
    .insert({
      name,
      part_number: part_number || null,
      category: category || null,
      qty_on_hand: qty_on_hand ?? 0,
      cost: cost ?? 0,
      price: price ?? 0,
      min_stock: min_stock ?? 0,
      vendor_id: vendor_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
