import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Get estimate with customer and portal_token
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, display_id, portal_token, customer:customers(id, name, phone)')
    .eq('id', id)
    .single();

  if (!estimate?.portal_token) {
    return NextResponse.json({ error: 'Estimate not found or has no portal token' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCustomer = estimate.customer as any;
  const customer = rawCustomer && !Array.isArray(rawCustomer)
    ? rawCustomer as { id: string; name: string; phone: string }
    : Array.isArray(rawCustomer) ? rawCustomer[0] as { id: string; name: string; phone: string } | undefined : null;

  // Build portal URL
  const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
  const url = `${origin}/portal/${estimate.portal_token}`;

  // Send SMS if customer has a phone number
  if (customer?.phone) {
    try {
      const shopName = await getShopName(supabase);
      const smsBody = `${shopName}: Your estimate ${estimate.display_id} is ready for review. View and approve here: ${url}`;

      await fetch(new URL('/api/send-sms', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
        body: JSON.stringify({
          to: customer.phone,
          message: smsBody,
          customer_id: customer.id,
        }),
      });
    } catch {
      // SMS is best-effort
    }
  }

  return NextResponse.json({ url, sms_sent: !!customer?.phone });
}

async function getShopName(supabase: ReturnType<typeof import('@/lib/supabase-server').createServerClient>) {
  const { data } = await supabase.from('shops').select('name').limit(1).single();
  return data?.name || 'Your Shop';
}
