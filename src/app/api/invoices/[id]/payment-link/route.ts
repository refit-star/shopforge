import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { stripe } from '@/lib/stripe';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Fetch invoice
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name)
    `)
    .eq('id', id)
    .single();

  if (invError) {
    const status = invError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: invError.message }, { status });
  }

  if (invoice.status === 'Paid') {
    return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 });
  }

  const origin = req.nextUrl.origin;

  // Create Stripe Checkout Session
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

  // Update invoice with payment link
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ stripe_payment_link: session.url })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
