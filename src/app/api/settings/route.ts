import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import { getShopSecrets } from '@/lib/secrets-server';

const SENSITIVE_FIELDS = [
  'resend_api_key',
  'twilio_account_sid',
  'twilio_auth_token',
  'twilio_phone_number',
  'stripe_secret_key',
  'stripe_publishable_key',
  'stripe_webhook_secret',
  'partstech_api_key',
  'plate_lookup_api_key',
  'qb_access_token',
  'qb_refresh_token',
];

// Fields that live in shop_secrets instead of shops
const SECRET_COLUMNS = [
  'resend_api_key',
  'twilio_account_sid',
  'twilio_auth_token',
  'stripe_secret_key',
  'stripe_webhook_secret',
  'partstech_api_key',
  'plate_lookup_api_key',
  'qb_access_token',
  'qb_refresh_token',
];

function maskValue(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return value;
  return '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + value.slice(-4);
}

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  // Merge secrets from shop_secrets table (admin client only)
  const secrets = await getShopSecrets();

  // Map shops.name → shop_name for frontend compat
  const result: Record<string, unknown> = { ...data, ...secrets, shop_name: data.name };

  // Mask sensitive fields before returning to client
  for (const field of SENSITIVE_FIELDS) {
    if (field in result) {
      result[field] = maskValue(result[field] as string | null);
    }
  }

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  // Fields allowed on the shops table
  const shopFields = [
    'shop_name', 'address', 'phone', 'email',
    'owner_name', 'owner_initials',
    'default_labor_rate', 'tax_rate',
    'hours_start', 'hours_end',
    'invoice_footer',
    'wo_prefix', 'invoice_prefix',
    'logo_url',
    'twilio_phone_number',
    'stripe_publishable_key',
    'partstech_username',
    'sms_auto_templates',
    'text_to_pay_enabled',
    'dvi_auto_send',
    'dvi_estimate_auto_send',
    'setup_completed_at',
    'online_booking_enabled',
    'booking_lead_hours',
    'booking_window_days',
  ];

  const shopUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const secretUpdates: Record<string, unknown> = {};

  for (const key of [...shopFields, ...SECRET_COLUMNS]) {
    if (!(key in body)) continue;
    const val = body[key];
    // Skip masked values — don't overwrite real keys with mask dots
    if (typeof val === 'string' && val.startsWith('\u2022\u2022\u2022\u2022')) continue;

    if (SECRET_COLUMNS.includes(key)) {
      secretUpdates[key] = val;
    } else {
      const dbKey = key === 'shop_name' ? 'name' : key;
      shopUpdates[dbKey] = val;
    }
  }

  // Update shops table via RLS-scoped client
  const { data, error } = await supabase
    .from('shops')
    .update(shopUpdates)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }

  // Update shop_secrets via admin client if any secret fields changed
  if (Object.keys(secretUpdates).length > 0) {
    const admin = createAdminClient();
    secretUpdates.updated_at = new Date().toISOString();
    const { error: secretError } = await admin
      .from('shop_secrets')
      .upsert({ shop_id: data.id, ...secretUpdates }, { onConflict: 'shop_id' });

    if (secretError) {
      return NextResponse.json({ error: 'Failed to update credentials' }, { status: 500 });
    }
  }

  // Fetch updated secrets for response
  const secrets = await getShopSecrets();
  const result: Record<string, unknown> = { ...data, ...secrets, shop_name: data.name };

  // Mask sensitive fields in the response
  for (const field of SENSITIVE_FIELDS) {
    if (field in result) {
      result[field] = maskValue(result[field] as string | null);
    }
  }

  return NextResponse.json(result);
}
