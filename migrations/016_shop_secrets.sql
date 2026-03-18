-- Migration: Move sensitive credentials from shops to shop_secrets table
-- The shops table RLS allows any authenticated shop user to SELECT all columns.
-- Since Supabase RLS cannot do column-level security, we move secrets to a
-- separate table with a restrictive RLS policy that blocks all access via
-- the anon/authenticated role. Only service_role (createAdminClient) can read.

-- 1. Create shop_secrets table
CREATE TABLE IF NOT EXISTS shop_secrets (
  shop_id uuid PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  twilio_account_sid text,
  twilio_auth_token text,
  stripe_secret_key text,
  stripe_webhook_secret text,
  qb_access_token text,
  qb_refresh_token text,
  qb_token_expires_at timestamptz,
  qb_realm_id text,
  qb_oauth_state text,
  resend_api_key text,
  partstech_api_key text,
  plate_lookup_api_key text,
  updated_at timestamptz DEFAULT now()
);

-- 2. Enable RLS and create a DENY-ALL policy
ALTER TABLE shop_secrets ENABLE ROW LEVEL SECURITY;

-- No policies = no access via anon or authenticated roles.
-- Only service_role (which bypasses RLS) can read/write.

-- 3. Migrate existing data from shops to shop_secrets
INSERT INTO shop_secrets (
  shop_id, twilio_account_sid, twilio_auth_token,
  stripe_secret_key, stripe_webhook_secret,
  qb_access_token, qb_refresh_token, qb_token_expires_at, qb_realm_id, qb_oauth_state,
  resend_api_key, partstech_api_key, plate_lookup_api_key
)
SELECT
  id, twilio_account_sid, twilio_auth_token,
  stripe_secret_key, stripe_webhook_secret,
  qb_access_token, qb_refresh_token, qb_token_expires_at, qb_realm_id, qb_oauth_state,
  resend_api_key, partstech_api_key, plate_lookup_api_key
FROM shops
ON CONFLICT (shop_id) DO NOTHING;

-- 4. Drop the secret columns from shops table
-- (keeping twilio_phone_number, stripe_publishable_key as they are not secrets)
ALTER TABLE shops
  DROP COLUMN IF EXISTS twilio_account_sid,
  DROP COLUMN IF EXISTS twilio_auth_token,
  DROP COLUMN IF EXISTS stripe_secret_key,
  DROP COLUMN IF EXISTS stripe_webhook_secret,
  DROP COLUMN IF EXISTS qb_access_token,
  DROP COLUMN IF EXISTS qb_refresh_token,
  DROP COLUMN IF EXISTS qb_token_expires_at,
  DROP COLUMN IF EXISTS qb_realm_id,
  DROP COLUMN IF EXISTS qb_oauth_state,
  DROP COLUMN IF EXISTS resend_api_key,
  DROP COLUMN IF EXISTS partstech_api_key,
  DROP COLUMN IF EXISTS plate_lookup_api_key;
