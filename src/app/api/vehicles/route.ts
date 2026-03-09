import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { customer_id, year, make, model, vin, mileage, plate } = body;

  if (!customer_id || !make || !model) {
    return NextResponse.json(
      { error: 'customer_id, make, and model are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      customer_id,
      year: year || null,
      make,
      model,
      vin: vin || null,
      mileage: mileage || null,
      plate: plate || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
