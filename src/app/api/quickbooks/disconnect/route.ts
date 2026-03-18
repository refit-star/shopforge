import { NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function POST() {
  const supabase = createServerClient();

  // Get shop_id via RLS
  const { data: shop } = await supabase.from('shops').select('id').single();
  if (!shop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Clear QB tokens from shop_secrets via admin client
  const admin = createAdminClient();
  const { error } = await admin
    .from('shop_secrets')
    .update({
      qb_realm_id: null,
      qb_access_token: null,
      qb_refresh_token: null,
      qb_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('shop_id', shop.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect QuickBooks' }, { status: 500 });
  }

  return NextResponse.json({ message: 'QuickBooks disconnected' });
}
