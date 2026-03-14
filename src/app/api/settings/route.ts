import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

const SENSITIVE_FIELDS = [
  'resend_api_key',
  'twilio_account_sid',
  'twilio_auth_token',
  'twilio_phone_number',
  'stripe_secret_key',
  'stripe_publishable_key',
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map shops.name → shop_name for frontend compat
  const result = { ...data, shop_name: data.name };

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

  const allowedFields = [
    'shop_name', 'address', 'phone', 'email',
    'owner_name', 'owner_initials',
    'default_labor_rate', 'tax_rate',
    'hours_start', 'hours_end',
    'invoice_footer',
    'wo_prefix', 'invoice_prefix',
    'logo_url',
    'resend_api_key',
    'twilio_account_sid',
    'twilio_auth_token',
    'twilio_phone_number',
    'stripe_secret_key',
    'stripe_publishable_key',
    'partstech_username',
    'partstech_api_key',
    'sms_auto_templates',
    'text_to_pay_enabled',
    'dvi_auto_send',
    'dvi_estimate_auto_send',
    'setup_completed_at',
    'online_booking_enabled',
    'booking_lead_hours',
    'booking_window_days',
    'plate_lookup_api_key',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const key of allowedFields) {
    if (key in body) {
      // Skip masked values — don't overwrite real keys with mask dots
      const val = body[key];
      if (typeof val === 'string' && val.startsWith('\u2022\u2022\u2022\u2022')) continue;
      // Map shop_name → name for the shops table column
      const dbKey = key === 'shop_name' ? 'name' : key;
      updates[dbKey] = body[key];
    }
  }

  const { data, error } = await supabase
    .from('shops')
    .update(updates)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map shops.name → shop_name for frontend compat
  const result = { ...data, shop_name: data.name };

  // Mask sensitive fields in the response
  for (const field of SENSITIVE_FIELDS) {
    if (field in result) {
      result[field] = maskValue(result[field] as string | null);
    }
  }

  return NextResponse.json(result);
}
