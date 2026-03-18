import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getStripeClient, resolveStripeKey } from '@/lib/stripe';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const sendSms = body.send_sms === true;

  // Fetch invoice with customer phone
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, phone)
    `)
    .eq('id', id)
    .single();

  if (invError) {
    if (invError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(invError);
  }

  if (invoice.status === 'Paid') {
    return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
  }

  // Get shop info + secrets
  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, twilio_phone_number, text_to_pay_enabled')
    .single();

  if (!shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  // Fetch secrets via admin client (shop_secrets has no anon/auth access)
  const { createAdminClient: createAdmin } = await import('@/lib/supabase-server');
  const admin = createAdmin();
  const { data: secrets } = await admin
    .from('shop_secrets')
    .select('stripe_secret_key, twilio_account_sid, twilio_auth_token')
    .eq('shop_id', shop.id)
    .single();

  let stripeKey: string;
  try {
    stripeKey = resolveStripeKey(secrets?.stripe_secret_key);
  } catch {
    return NextResponse.json({ error: 'Stripe is not configured. Add your Stripe secret key in Settings → Integrations.' }, { status: 400 });
  }

  const stripe = getStripeClient(stripeKey);

  let paymentUrl = invoice.stripe_payment_link;

  // Check if existing Checkout Session is still active
  if (paymentUrl) {
    try {
      // Extract session ID from URL (format: https://checkout.stripe.com/c/pay/cs_live_...)
      const sessionIdMatch = paymentUrl.match(/cs_(?:live|test)_[a-zA-Z0-9]+/);
      if (sessionIdMatch) {
        const existing = await stripe.checkout.sessions.retrieve(sessionIdMatch[0]);
        if (existing.status !== 'open') {
          // Session expired or completed — need a fresh one
          paymentUrl = null;
        }
      } else {
        // Can't parse session ID — create fresh
        paymentUrl = null;
      }
    } catch {
      // Session retrieval failed — create fresh
      paymentUrl = null;
    }
  }

  // Create a new Stripe Checkout Session if needed
  if (!paymentUrl) {
    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.display_id}`,
            },
            unit_amount: Math.round(Number(invoice.total) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: invoice.id,
      },
      success_url: `${origin}/invoicing?paid=${invoice.display_id}`,
      cancel_url: `${origin}/invoicing`,
    });

    paymentUrl = session.url;

    // Update invoice with fresh payment link
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ stripe_payment_link: paymentUrl })
      .eq('id', id);

    if (updateError) {
      return internalError(updateError);
    }
  }

  // Send SMS with payment link if requested
  let smsSent = false;
  if (sendSms) {
    try {
      const customer = invoice.customer as { id: string; name: string; phone: string | null } | null;
      if (customer?.phone) {
        if (
          shop?.text_to_pay_enabled &&
          secrets?.twilio_account_sid &&
          secrets?.twilio_auth_token &&
          shop.twilio_phone_number
        ) {
          const amount = Number(invoice.total).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          });
          const message = `Invoice ${invoice.display_id} for ${amount} from ${shop.name} is ready. Pay here: ${paymentUrl}`;

          const credentials = Buffer.from(
            `${secrets.twilio_account_sid}:${secrets.twilio_auth_token}`
          ).toString('base64');

          const smsParams = new URLSearchParams();
          smsParams.append('From', shop.twilio_phone_number);
          smsParams.append('To', customer.phone);
          smsParams.append('Body', message);

          const smsRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${secrets.twilio_account_sid}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: smsParams.toString(),
            }
          );

          if (smsRes.ok) {
            const smsData = await smsRes.json();
            // Log to sms_messages
            await supabase.from('sms_messages').insert({
              customer_id: customer.id,
              direction: 'outbound',
              phone_number: customer.phone,
              body: message,
              twilio_message_sid: smsData.sid,
            });
            smsSent = true;
          }
        }
      }
    } catch {
      // Best-effort — don't block payment link creation
    }
  }

  return NextResponse.json({ url: paymentUrl, sms_sent: smsSent });
}
