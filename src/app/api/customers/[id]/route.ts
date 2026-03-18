import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Customer info
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (custError) {
    if (custError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(custError);
  }

  // Their vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false });

  // Service history: work orders with status != 'Check-In', joined with vehicle info
  const { data: serviceHistory } = await supabase
    .from('work_orders')
    .select(`
      *,
      vehicle:vehicles(id, year, make, model),
      tech:techs(id, name, color)
    `)
    .eq('customer_id', id)
    .neq('status', 'Check-In')
    .order('created_at', { ascending: false });

  // All invoices for this customer (for service history timeline)
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id, display_id, status, total, labor_total, parts_total, tax,
      payment_method, paid_at, created_at,
      vehicle:vehicles(id, year, make, model)
    `)
    .eq('customer_id', id)
    .order('created_at', { ascending: false });

  // Outstanding balance: sum of total from Sent/Overdue invoices
  const outstanding_balance = (invoices || [])
    .filter(inv => inv.status === 'Sent' || inv.status === 'Overdue')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  return NextResponse.json({
    ...customer,
    vehicles: vehicles || [],
    service_history: serviceHistory || [],
    invoices: invoices || [],
    outstanding_balance: Math.round(outstanding_balance * 100) / 100,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  const allowedFields = ['name', 'phone', 'email', 'address', 'city', 'state', 'zip', 'tags'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(error);
  }

  return NextResponse.json(data);
}
