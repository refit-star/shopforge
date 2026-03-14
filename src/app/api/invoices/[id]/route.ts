import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { syncInvoiceToQB, syncPaymentToQB } from '@/lib/quickbooks';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, mileage, plate),
      invoice_labor_lines(id, description, hours, rate, sort_order),
      invoice_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('id', id)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    ...data,
    labor_lines: data.invoice_labor_lines,
    parts_lines: data.invoice_parts_lines,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  const updates: Record<string, unknown> = {};

  if ('status' in body) {
    updates.status = body.status;

    if (body.status === 'Paid') {
      updates.paid_at = new Date().toISOString();
    }
    if (body.status === 'Void') {
      updates.paid_at = null;
      updates.payment_method = null;
      updates.voided_at = new Date().toISOString();
    }
  }

  if ('payment_method' in body) {
    updates.payment_method = body.payment_method;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      customer:customers(id, name),
      vehicle:vehicles(id, year, make, model),
      invoice_labor_lines(id, description, hours, rate, sort_order),
      invoice_parts_lines(id, name, qty, price, sort_order)
    `)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Best-effort QB sync (fire-and-forget)
  if (body.status === 'Sent' && data.shop_id) {
    syncInvoiceToQB(id, data.shop_id).catch(() => {});
  }
  if (body.status === 'Paid' && data.shop_id) {
    syncPaymentToQB(id, data.shop_id, data.payment_method).catch(() => {});
  }

  return NextResponse.json({
    ...data,
    labor_lines: data.invoice_labor_lines,
    parts_lines: data.invoice_parts_lines,
  });
}
