import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

async function getShopInfo(supabase: ReturnType<typeof createAdminClient>, shopId: string) {
  const { data } = await supabase
    .from('shops')
    .select('name, address, phone, email, logo_url')
    .eq('id', shopId)
    .single();
  return data ? { shop_name: data.name, address: data.address, phone: data.phone, email: data.email, logo_url: data.logo_url } : null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Try estimates first
  const { data: estimate } = await supabase
    .from('estimates')
    .select(`
      id, display_id, status, valid_until, notes, created_at, shop_id,
      customer_id, vehicle_id,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, plate),
      estimate_labor_lines(id, description, hours, rate, sort_order),
      estimate_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('portal_token', token)
    .single();

  if (estimate) {
    const laborLines = (estimate.estimate_labor_lines as { hours: number; rate: number }[]) || [];
    const partsLines = (estimate.estimate_parts_lines as { qty: number; price: number }[]) || [];
    const labor_total = laborLines.reduce((sum, l) => sum + Number(l.hours) * Number(l.rate), 0);
    const parts_total = partsLines.reduce((sum, p) => sum + Number(p.qty) * Number(p.price), 0);
    const shop = await getShopInfo(supabase, estimate.shop_id);

    // Fetch signature if estimate is approved
    let signature = null;
    if (estimate.status === 'Approved') {
      const { data: sig } = await supabase
        .from('estimate_signatures')
        .select('signer_name, signature_url, approved_at')
        .eq('estimate_id', estimate.id)
        .single();
      signature = sig || null;
    }

    return NextResponse.json({
      type: 'estimate',
      shop,
      data: {
        id: estimate.id,
        display_id: estimate.display_id,
        status: estimate.status,
        valid_until: estimate.valid_until,
        notes: estimate.notes,
        created_at: estimate.created_at,
        customer: estimate.customer,
        vehicle: estimate.vehicle,
        labor_lines: laborLines,
        parts_lines: partsLines,
        labor_total: Math.round(labor_total * 100) / 100,
        parts_total: Math.round(parts_total * 100) / 100,
        estimated_total: Math.round((labor_total + parts_total) * 100) / 100,
        signature,
      },
    });
  }

  // Try invoices
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id, display_id, status, notes, created_at, shop_id,
      customer_id, vehicle_id, total, tax, labor_total, parts_total,
      payment_method, paid_at,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, plate),
      invoice_labor_lines(id, description, hours, rate, sort_order),
      invoice_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('portal_token', token)
    .single();

  if (invoice) {
    const shop = await getShopInfo(supabase, invoice.shop_id);

    return NextResponse.json({
      type: 'invoice',
      shop,
      data: {
        id: invoice.id,
        display_id: invoice.display_id,
        status: invoice.status,
        notes: invoice.notes,
        created_at: invoice.created_at,
        total: invoice.total,
        tax: invoice.tax,
        labor_total: invoice.labor_total,
        parts_total: invoice.parts_total,
        payment_method: invoice.payment_method,
        paid_at: invoice.paid_at,
        customer: invoice.customer,
        vehicle: invoice.vehicle,
        labor_lines: invoice.invoice_labor_lines,
        parts_lines: invoice.invoice_parts_lines,
      },
    });
  }

  return NextResponse.json({ error: 'Document not found' }, { status: 404 });
}
