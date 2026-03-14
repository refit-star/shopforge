import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Get inspection portal_token
  const { data: inspection } = await supabase
    .from('inspections')
    .select('id, portal_token')
    .eq('work_order_id', id)
    .single();

  if (!inspection?.portal_token) {
    return NextResponse.json({ error: 'No inspection found for this work order' }, { status: 404 });
  }

  // Get customer phone from work order
  const { data: wo } = await supabase
    .from('work_orders')
    .select('customer:customers(id, name, phone)')
    .eq('id', id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCustomer = wo?.customer as any;
  const customer = rawCustomer && !Array.isArray(rawCustomer) ? rawCustomer as { id: string; name: string; phone: string } : Array.isArray(rawCustomer) ? rawCustomer[0] as { id: string; name: string; phone: string } | undefined : null;

  // Build portal URL
  const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
  const url = `${origin}/portal/inspection/${inspection.portal_token}`;

  // Send SMS if customer has a phone number
  if (customer?.phone) {
    try {
      const shopName = await getShopName(supabase);
      const smsBody = `${shopName}: Your vehicle inspection report is ready. View results and photos here: ${url}`;

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
      // SMS is best-effort — still return the URL
    }
  }

  return NextResponse.json({ url, sms_sent: !!customer?.phone });
}

async function getShopName(supabase: ReturnType<typeof import('@/lib/supabase-server').createServerClient>) {
  const { data } = await supabase.from('shops').select('name').limit(1).single();
  return data?.name || 'Your Shop';
}
