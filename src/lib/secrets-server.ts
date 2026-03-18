import { createAdminClient, createServerClient } from '@/lib/supabase-server';

/**
 * Returns the shop_secrets row for the current user's shop.
 * Uses createServerClient to resolve shop_id via RLS, then
 * createAdminClient to read from shop_secrets (which has no
 * anon/authenticated access policies — only service_role can read).
 */
export async function getShopSecrets() {
  // Resolve the user's shop_id via RLS
  const supabase = createServerClient();
  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .single();

  if (!shop) return null;

  // Read secrets via admin client (bypasses RLS)
  const admin = createAdminClient();
  const { data } = await admin
    .from('shop_secrets')
    .select('*')
    .eq('shop_id', shop.id)
    .single();

  return data;
}

/**
 * Returns secrets for a specific shop_id. Use only in contexts
 * where shop_id is already validated (webhooks, portal routes, etc).
 */
export async function getShopSecretsById(shopId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('shop_secrets')
    .select('*')
    .eq('shop_id', shopId)
    .single();

  return data;
}
