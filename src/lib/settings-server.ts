import { createServerClient } from '@/lib/supabase-server';
import { getShopSecrets } from '@/lib/secrets-server';

/** Returns shop settings merged with secrets for server-side use.
 *  Shop data via RLS-scoped createServerClient, secrets via admin client.
 *  Never send the result of this function directly to the client. */
export async function getFullSettings() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .single();

  if (error || !data) return null;

  // Fetch secrets via admin client (shop_secrets has no anon/auth access)
  const secrets = await getShopSecrets();

  // Map shops.name → shop_name for backward compat with ShopSettings interface
  return { ...data, ...secrets, shop_name: data.name };
}

/** Resolve Twilio SID + auth token.
 *  Per-shop credentials in shop_secrets take priority.
 *  Falls back to platform env vars TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. */
export function resolveTwilioCreds(secrets: Record<string, unknown> | null): { sid: string; token: string } | null {
  const sid = (secrets?.twilio_account_sid as string) || process.env.TWILIO_ACCOUNT_SID || '';
  const token = (secrets?.twilio_auth_token as string) || process.env.TWILIO_AUTH_TOKEN || '';
  if (!sid || !token) return null;
  return { sid, token };
}

/** Resolve Resend API key.
 *  Per-shop key in shop_secrets takes priority.
 *  Falls back to platform env var RESEND_API_KEY. */
export function resolveResendKey(secrets: Record<string, unknown> | null): string | null {
  return (secrets?.resend_api_key as string) || process.env.RESEND_API_KEY || null;
}
