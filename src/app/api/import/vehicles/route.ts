import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { rows } = await req.json() as {
    rows: Record<string, string>[];
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Fetch customers for name/email matching
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email');

  const byName: Record<string, string> = {};
  const byEmail: Record<string, string> = {};
  for (const c of customers || []) {
    byName[c.name.toLowerCase().trim()] = c.id;
    if (c.email) byEmail[c.email.toLowerCase().trim()] = c.id;
  }

  // Fetch existing vehicles for VIN dedup
  const { data: existingVehicles } = await supabase
    .from('vehicles')
    .select('vin');

  const existingVins = new Set<string>();
  for (const v of existingVehicles || []) {
    if (v.vin) existingVins.add(v.vin.toUpperCase().trim());
  }

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;
  let unmatched = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const make = r.make?.trim();
    const model = r.model?.trim();
    if (!make || !model) {
      errors.push({ row: i + 1, error: 'Missing make or model' });
      continue;
    }

    // Resolve customer
    let customerId: string | null = null;
    if (r.customer_name) {
      customerId = byName[r.customer_name.toLowerCase().trim()] || null;
    }
    if (!customerId && r.customer_email) {
      customerId = byEmail[r.customer_email.toLowerCase().trim()] || null;
    }
    if (!customerId) {
      unmatched++;
      continue;
    }

    // VIN dedup
    const vin = r.vin?.trim().toUpperCase() || null;
    if (vin && existingVins.has(vin)) {
      skipped++;
      continue;
    }

    toInsert.push({
      customer_id: customerId,
      year: r.year ? parseInt(r.year, 10) || null : null,
      make,
      model,
      vin: vin || null,
      plate: r.plate?.trim() || null,
    });

    if (vin) existingVins.add(vin);
  }

  let imported = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from('vehicles').insert(toInsert);
    if (error) {
      errors.push({ row: 0, error: `Batch insert failed: ${error.message}` });
    } else {
      imported = toInsert.length;
    }
  }

  return NextResponse.json({ imported, skipped, unmatched, errors });
}
