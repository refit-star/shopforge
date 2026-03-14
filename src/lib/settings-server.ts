import { createServerClient } from '@/lib/supabase-server';

/** Returns unmasked shop settings for server-side use.
 *  Uses createServerClient so RLS scopes to the current user's shop
 *  via get_shop_id() (falls back to user_shops lookup). */
export async function getFullSettings() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .single();

  if (error) return null;

  // Map shops.name → shop_name for backward compat with ShopSettings interface
  return { ...data, shop_name: data.name };
}
