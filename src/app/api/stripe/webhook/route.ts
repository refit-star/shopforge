import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { getStripeClient, resolveStripeKey } from '@/lib/stripe';
import { syncPaymentToQB } from '@/lib/quickbooks';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Parse the raw payload to extract invoice_id from metadata (before verification).
  // This lets us look up the shop to get per-shop webhook secret.
  let shopId: string | null = null;
  let shopStripeKey: string | null = null;
  let webhookSecret: string | null = null;

  try {
    const rawEvent = JSON.parse(body);
    const invoiceId = rawEvent?.data?.object?.metadata?.invoice_id;

    if (invoiceId) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('shop_id')
        .eq('id', invoiceId)
        .single();

      if (invoice?.shop_id) {
        shopId = invoice.shop_id;

        const { data: secrets } = await supabase
          .from('shop_secrets')
          .select('stripe_secret_key, stripe_webhook_secret')
          .eq('shop_id', invoice.shop_id)
          .single();

        if (secrets) {
          shopStripeKey = secrets.stripe_secret_key;
          webhookSecret = secrets.stripe_webhook_secret;
        }
      }
    }
  } catch {
    // Couldn't pre-parse — will fall back to env var
  }

  // Fall back to platform-level env vars if no per-shop secrets found
  if (!webhookSecret) {
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;
    if (webhookSecret) {
      console.warn('[Stripe Webhook] No per-shop stripe_webhook_secret, falling back to STRIPE_WEBHOOK_SECRET env var');
    }
  }

  if (!webhookSecret) {
    return NextResponse.json({ error: 'No Stripe webhook secret configured' }, { status: 500 });
  }

  // Verify the webhook signature
  let stripeKey: string;
  try {
    stripeKey = resolveStripeKey(shopStripeKey);
  } catch {
    return NextResponse.json({ error: 'No Stripe secret key configured' }, { status: 500 });
  }

  const stripe = getStripeClient(stripeKey);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;

    if (invoiceId) {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'Paid',
          payment_method: 'Stripe',
          stripe_payment_intent_id: session.payment_intent as string,
          paid_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (error) {
        console.error('Failed to update invoice after Stripe payment:', error.message);
        return NextResponse.json({ error: 'Failed to process payment' }, { status: 500 });
      }

      // Best-effort QB payment sync
      const resolvedShopId = shopId || (await supabase.from('invoices').select('shop_id').eq('id', invoiceId).single()).data?.shop_id;
      if (resolvedShopId) {
        syncPaymentToQB(invoiceId, resolvedShopId, 'Stripe').catch(() => {});
      }
    }
  }

  return NextResponse.json({ received: true });
}
