import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const status = req.nextUrl.searchParams.get('status');
  const customerId = req.nextUrl.searchParams.get('customer_id');

  let query = supabase
    .from('service_reminders')
    .select('*, vehicle:vehicles(id, year, make, model, plate), customer:customers(id, name, phone)')
    .order('due_date', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }
  if (customerId) {
    query = query.eq('customer_id', customerId);
  }

  const { data, error } = await query;

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { vehicle_id, customer_id, service_type, due_date, due_mileage } = body;

  if (!vehicle_id || !customer_id || !service_type) {
    return NextResponse.json(
      { error: 'vehicle_id, customer_id, and service_type are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('service_reminders')
    .insert({
      vehicle_id,
      customer_id,
      service_type,
      due_date: due_date || null,
      due_mileage: due_mileage || null,
    })
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
