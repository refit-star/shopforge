import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/phone';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { rows, mode } = await req.json() as {
    rows: Record<string, string>[];
    mode: 'skip' | 'update';
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Fetch existing customers for dedup
  const { data: existing } = await supabase
    .from('customers')
    .select('id, name, phone, email');

  const byPhone: Record<string, { id: string }> = {};
  const byEmail: Record<string, { id: string }> = {};
  for (const c of existing || []) {
    if (c.phone) {
      const norm = normalizePhone(c.phone);
      if (norm.length >= 7) byPhone[norm] = c;
    }
    if (c.email) byEmail[c.email.toLowerCase().trim()] = c;
  }

  const toInsert: Record<string, string | null>[] = [];
  const toUpdate: { id: string; data: Record<string, string | null> }[] = [];
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = r.name?.trim();
    if (!name) { errors.push({ row: i + 1, error: 'Missing name' }); continue; }

    // Dedup check
    let match: { id: string } | null = null;
    if (r.phone) {
      const norm = normalizePhone(r.phone);
      if (norm.length >= 7) match = byPhone[norm] || null;
    }
    if (!match && r.email) {
      match = byEmail[r.email.toLowerCase().trim()] || null;
    }

    if (match) {
      if (mode === 'update') {
        toUpdate.push({
          id: match.id,
          data: {
            name,
            phone: r.phone?.trim() || null,
            email: r.email?.trim() || null,
            address: r.address?.trim() || null,
            city: r.city?.trim() || null,
            state: r.state?.trim() || null,
            zip: r.zip?.trim() || null,
          },
        });
      } else {
        skipped++;
      }
      continue;
    }

    toInsert.push({
      name,
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      address: r.address?.trim() || null,
      city: r.city?.trim() || null,
      state: r.state?.trim() || null,
      zip: r.zip?.trim() || null,
    });
  }

  let imported = 0;
  let updated = 0;

  // Batch insert new customers
  if (toInsert.length > 0) {
    const { error } = await supabase.from('customers').insert(toInsert);
    if (error) {
      errors.push({ row: 0, error: `Batch insert failed: ${error.message}` });
    } else {
      imported = toInsert.length;
    }
  }

  // Update existing
  for (const u of toUpdate) {
    const { error } = await supabase.from('customers').update(u.data).eq('id', u.id);
    if (error) {
      errors.push({ row: 0, error: `Update failed: ${error.message}` });
    } else {
      updated++;
    }
  }

  return NextResponse.json({ imported, updated, skipped, errors });
}
