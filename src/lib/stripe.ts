import Stripe from 'stripe';

const stripeCache = new Map<string, Stripe>();

/**
 * Returns a Stripe client for the given secret key.
 * Caches instances to avoid re-creating per request for the same key.
 */
export function getStripeClient(secretKey: string): Stripe {
  let client = stripeCache.get(secretKey);
  if (!client) {
    client = new Stripe(secretKey);
    stripeCache.set(secretKey, client);
  }
  return client;
}

/**
 * Resolves the Stripe secret key for a shop.
 * Uses per-shop key if available, falls back to platform env var.
 */
export function resolveStripeKey(shopStripeKey: string | null | undefined): string {
  if (shopStripeKey) return shopStripeKey;
  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) {
    console.warn('[Stripe] No per-shop stripe_secret_key configured, falling back to platform STRIPE_SECRET_KEY env var');
    return envKey;
  }
  throw new Error('No Stripe secret key configured — set stripe_secret_key in shop settings or STRIPE_SECRET_KEY env var');
}
