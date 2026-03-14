import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const scheduledDate: string | null = body.scheduled_date || null;

  // Fetch the estimate
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', id)
    .single();

  if (estError) {
    const status = estError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: estError.message }, { status });
  }

  // Fetch estimate labor and parts lines
  const { data: estLabor } = await supabase
    .from('estimate_labor_lines')
    .select('description, hours, rate, sort_order')
    .eq('estimate_id', id)
    .order('sort_order');

  const { data: estParts } = await supabase
    .from('estimate_parts_lines')
    .select('name, qty, price, sort_order')
    .eq('estimate_id', id)
    .order('sort_order');

  // Generate WO display_id
  const { data: idResult, error: idError } = await supabase.rpc('next_wo_id');
  if (idError) {
    return NextResponse.json({ error: idError.message }, { status: 500 });
  }

  const display_id = idResult as string;

  // Create work order
  const { data: wo, error: woError } = await supabase
    .from('work_orders')
    .insert({
      display_id,
      customer_id: estimate.customer_id,
      vehicle_id: estimate.vehicle_id,
      job: estimate.job,
      notes: estimate.notes,
      status: scheduledDate ? 'Scheduled' : 'Unscheduled',
      scheduled_date: scheduledDate,
    })
    .select()
    .single();

  if (woError) {
    return NextResponse.json({ error: woError.message }, { status: 500 });
  }

  // Copy labor lines to wo_labor_lines
  if (estLabor && estLabor.length > 0) {
    const laborRows = estLabor.map((l) => ({
      work_order_id: wo.id,
      description: l.description,
      hours: Number(l.hours),
      rate: Number(l.rate),
      sort_order: l.sort_order,
    }));

    const { error: laborError } = await supabase
      .from('wo_labor_lines')
      .insert(laborRows);

    if (laborError) {
      return NextResponse.json({ error: laborError.message }, { status: 500 });
    }
  }

  // Copy parts lines to wo_parts_lines
  if (estParts && estParts.length > 0) {
    const partsRows = estParts.map((p: any) => ({
      work_order_id: wo.id,
      name: p.name,
      qty: p.qty,
      price: Number(p.price),
      sort_order: p.sort_order,
      source: p.source || 'manual',
      part_number: p.part_number || null,
      brand: p.brand || null,
    }));

    const { error: partsError } = await supabase
      .from('wo_parts_lines')
      .insert(partsRows);

    if (partsError) {
      return NextResponse.json({ error: partsError.message }, { status: 500 });
    }
  }

  // Update estimate status to Approved
  await supabase
    .from('estimates')
    .update({ status: 'Approved' })
    .eq('id', id);

  // Return full work order with joins
  const { data: full, error: fullError } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, plate),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order, source, part_number, brand)
    `)
    .eq('id', wo.id)
    .single();

  if (fullError) {
    return NextResponse.json({ error: fullError.message }, { status: 500 });
  }

  return NextResponse.json(full, { status: 201 });
}
