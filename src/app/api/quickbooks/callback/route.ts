import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const realmId = req.nextUrl.searchParams.get('realmId');

  if (!code || !state || !realmId) {
    return NextResponse.redirect(new URL('/settings?qb=error', req.url));
  }

  // Extract nonce and shop_id from state (format: random_hex:shop_uuid)
  const nonce = state.split(':')[0];
  const shopId = state.split(':').slice(1).join(':');
  if (!shopId || !nonce) {
    return NextResponse.redirect(new URL('/settings?qb=error', req.url));
  }

  const supabase = createAdminClient();

  // Verify CSRF nonce matches what was stored during /connect
  const { data: shopSecrets } = await supabase
    .from('shop_secrets')
    .select('qb_oauth_state')
    .eq('shop_id', shopId)
    .single();

  if (!shopSecrets?.qb_oauth_state || !crypto.timingSafeEqual(
    Buffer.from(shopSecrets.qb_oauth_state),
    Buffer.from(nonce)
  )) {
    return NextResponse.redirect(new URL('/settings?qb=error&reason=csrf', req.url));
  }

  // Clear the nonce immediately (single-use)
  await supabase.from('shop_secrets').update({ qb_oauth_state: null }).eq('shop_id', shopId);

  const clientId = process.env.QB_CLIENT_ID;
  const clientSecret = process.env.QB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/settings?qb=error', req.url));
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/quickbooks/callback`;

  // Exchange authorization code for tokens
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(new URL('/settings?qb=error', req.url));
    }

    const tokens = await tokenRes.json();

    // Calculate token expiry (Intuit tokens expire in 3600s by default)
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    // Store tokens in shop_secrets
    const { error: updateError } = await supabase
      .from('shop_secrets')
      .upsert({
        shop_id: shopId,
        qb_realm_id: realmId,
        qb_access_token: tokens.access_token,
        qb_refresh_token: tokens.refresh_token,
        qb_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'shop_id' });

    if (updateError) {
      return NextResponse.redirect(new URL('/settings?qb=error', req.url));
    }

    return NextResponse.redirect(new URL('/settings?qb=connected', req.url));
  } catch {
    return NextResponse.redirect(new URL('/settings?qb=error', req.url));
  }
}
