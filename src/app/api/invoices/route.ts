import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings } from '@/lib/settings-server';
import { syncInvoiceToQB } from '@/lib/quickbooks';
import { internalError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      invoice_labor_lines(id, description, hours, rate, sort_order),
      invoice_parts_lines(id, name, qty, price, sort_order)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return internalError(error);
  }

  const enriched = (data || []).map((inv) => ({
    ...inv,
    labor_lines: inv.invoice_labor_lines,
    parts_lines: inv.invoice_parts_lines,
  }));

  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { work_order_id, customer_id, vehicle_id } = body;

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  // Generate display_id
  const { data: idResult, error: idError } = await supabase.rpc('next_inv_id');
  if (idError) {
    return internalError(idError);
  }

  const display_id = idResult as string;

  let laborLines: { description: string; hours: number; rate: number; sort_order: number }[] = [];
  let partsLines: { name: string; qty: number; price: number; sort_order: number }[] = [];

  // If work_order_id provided, snapshot WO lines
  if (work_order_id) {
    const { data: woLabor } = await supabase
      .from('wo_labor_lines')
      .select('description, hours, rate, sort_order')
      .eq('work_order_id', work_order_id)
      .order('sort_order');

    const { data: woParts } = await supabase
      .from('wo_parts_lines')
      .select('name, qty, price, sort_order')
      .eq('work_order_id', work_order_id)
      .order('sort_order');

    laborLines = (woLabor || []).map((l) => ({
      description: l.description,
      hours: Number(l.hours),
      rate: Number(l.rate),
      sort_order: l.sort_order,
    }));

    partsLines = (woParts || []).map((p) => ({
      name: p.name,
      qty: p.qty,
      price: Number(p.price),
      sort_order: p.sort_order,
    }));
  }

  // Fetch tax rate from shop settings
  const settings = await getFullSettings();
  const taxRate = settings?.tax_rate ? Number(settings.tax_rate) : 0.08;

  // Compute totals
  const labor_total = laborLines.reduce((sum, l) => sum + l.hours * l.rate, 0);
  const parts_total = partsLines.reduce((sum, p) => sum + p.qty * p.price, 0);
  const subtotal = labor_total + parts_total;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // Insert invoice
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      display_id,
      work_order_id: work_order_id || null,
      customer_id,
      vehicle_id: vehicle_id || null,
      labor_total: Math.round(labor_total * 100) / 100,
      parts_total: Math.round(parts_total * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
    })
    .select()
    .single();

  if (invError) {
    return internalError(invError);
  }

  // Insert labor lines
  if (laborLines.length > 0) {
    const { error: laborError } = await supabase
      .from('invoice_labor_lines')
      .insert(
        laborLines.map((l) => ({
          invoice_id: invoice.id,
          description: l.description,
          hours: l.hours,
          rate: l.rate,
          sort_order: l.sort_order,
        }))
      );

    if (laborError) {
      return internalError(laborError);
    }
  }

  // Insert parts lines
  if (partsLines.length > 0) {
    const { error: partsError } = await supabase
      .from('invoice_parts_lines')
      .insert(
        partsLines.map((p) => ({
          invoice_id: invoice.id,
          name: p.name,
          qty: p.qty,
          price: p.price,
          sort_order: p.sort_order,
        }))
      );

    if (partsError) {
      return internalError(partsError);
    }
  }

  // Return full invoice with lines
  const { data: full, error: fullError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      invoice_labor_lines(id, description, hours, rate, sort_order),
      invoice_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('id', invoice.id)
    .single();

  if (fullError) {
    return internalError(fullError);
  }

  // Best-effort QB sync on creation (primary trigger)
  const shopId = full.shop_id || invoice.shop_id;
  if (shopId) {
    syncInvoiceToQB(invoice.id, shopId).catch(() => {});
  }

  return NextResponse.json(
    {
      ...full,
      labor_lines: full.invoice_labor_lines,
      parts_lines: full.invoice_parts_lines,
    },
    { status: 201 }
  );
}
