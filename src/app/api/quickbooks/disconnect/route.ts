import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST() {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('shops')
    .update({
      qb_realm_id: null,
      qb_access_token: null,
      qb_refresh_token: null,
      qb_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'QuickBooks disconnected' });
}
