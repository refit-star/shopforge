import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const q = req.nextUrl.searchParams.get('q');
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .order('name')
    .range(from, to);

  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: customers, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json([]);
  }

  // Compute vehicle_count, last_visit, total_spend per customer
  const customerIds = customers.map((c) => c.id);

  // Vehicle counts
  const { data: vehicleCounts } = await supabase
    .from('vehicles')
    .select('customer_id')
    .in('customer_id', customerIds);

  const vCountMap: Record<string, number> = {};
  for (const v of vehicleCounts || []) {
    vCountMap[v.customer_id] = (vCountMap[v.customer_id] || 0) + 1;
  }

  // Last visit (max created_at from work_orders)
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('customer_id, created_at')
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false });

  const lastVisitMap: Record<string, string> = {};
  for (const wo of workOrders || []) {
    if (!lastVisitMap[wo.customer_id]) {
      lastVisitMap[wo.customer_id] = wo.created_at;
    }
  }

  // Total spend (sum of total from paid invoices)
  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('customer_id, total')
    .in('customer_id', customerIds)
    .eq('status', 'Paid');

  const spendMap: Record<string, number> = {};
  for (const inv of paidInvoices || []) {
    spendMap[inv.customer_id] = (spendMap[inv.customer_id] || 0) + Number(inv.total);
  }

  const enriched = customers.map((c) => ({
    ...c,
    vehicle_count: vCountMap[c.id] || 0,
    last_visit: lastVisitMap[c.id] || null,
    total_spend: Math.round((spendMap[c.id] || 0) * 100) / 100,
  }));

  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { name, phone, email, address, city, state, zip } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ name, phone: phone || null, email: email || null, address: address || null, city: city || null, state: state || null, zip: zip || null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
