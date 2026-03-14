import { NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function GET() {
  const supabase = createServerClient();

  // Verify user is authenticated and get their shop
  const { data: shop, error } = await supabase
    .from('shops')
    .select('id')
    .single();

  if (error || !shop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.QB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'QuickBooks not configured' }, { status: 500 });
  }

  // Generate CSRF nonce and store it on the shop record for validation in callback
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = nonce + ':' + shop.id;

  const admin = createAdminClient();
  await admin.from('shops').update({ qb_oauth_state: nonce }).eq('id', shop.id);

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/quickbooks/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri,
    state,
  });

  const authUrl = `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
