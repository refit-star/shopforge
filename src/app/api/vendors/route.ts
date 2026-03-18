import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const search = req.nextUrl.searchParams.get('search');
  const activeOnly = req.nextUrl.searchParams.get('active') !== 'false';

  let query = supabase
    .from('vendors')
    .select('*')
    .order('name');

  if (activeOnly) {
    query = query.eq('active', true);
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
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

  const { name, contact_name, email, phone, account_number, address, city, state, zip, notes } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      name,
      contact_name: contact_name || null,
      email: email || null,
      phone: phone || null,
      account_number: account_number || null,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
