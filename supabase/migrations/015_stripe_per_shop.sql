-- Per-shop Stripe webhook secret
ALTER TABLE shops ADD COLUMN IF NOT EXISTS stripe_webhook_secret text;
