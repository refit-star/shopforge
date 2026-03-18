import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Rate limit: max 3 approvals per token per hour
  if (!rateLimit(`dvi-approve:${token}`, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const supabase = createAdminClient();

  const body = await req.json();
  const { item_ids } = body;

  if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
    return NextResponse.json({ error: 'item_ids array is required' }, { status: 400 });
  }

  // Fetch inspection by portal_token
  const { data: inspection } = await supabase
    .from('inspections')
    .select('*, inspection_items(*)')
    .eq('portal_token', token)
    .single();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Get work order info
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, shop_id, customer_id, vehicle_id')
    .eq('id', inspection.work_order_id)
    .single();

  if (!wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  // Get shop settings
  const { data: shop } = await supabase
    .from('shops')
    .select('default_labor_rate, dvi_estimate_auto_send, phone, name, twilio_phone_number')
    .eq('id', wo.shop_id)
    .single();

  // Get Twilio secrets for SMS (per-shop override or platform fallback)
  const { data: shopSecretsRaw } = await supabase
    .from('shop_secrets')
    .select('twilio_account_sid, twilio_auth_token')
    .eq('shop_id', wo.shop_id)
    .single();
  const shopSecrets = {
    twilio_account_sid: shopSecretsRaw?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '',
    twilio_auth_token: shopSecretsRaw?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || '',
  };

  const laborRate = shop?.default_labor_rate ? Number(shop.default_labor_rate) : 125;
  const autoSend = shop?.dvi_estimate_auto_send !== false; // default true

  // Filter to only the selected items that are fail or attention
  const selectedItems = (inspection.inspection_items || []).filter(
    (item: { id: string; status: string }) =>
      item_ids.includes(item.id) && (item.status === 'fail' || item.status === 'attention')
  );

  if (selectedItems.length === 0) {
    return NextResponse.json({ error: 'No valid items selected' }, { status: 400 });
  }

  // Generate estimate display_id
  const { data: estId, error: idError } = await supabase.rpc('next_est_id', { p_shop_id: wo.shop_id });
  if (idError) {
    return internalError(idError);
  }

  // Build job description from selected items
  const job = 'DVI Recommended Services: ' + selectedItems
    .map((item: { category: string; item: string }) => `${item.category} - ${item.item}`)
    .join(', ');

  // Create estimate (Sent if auto-send enabled, Draft otherwise)
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .insert({
      display_id: estId as string,
      customer_id: wo.customer_id,
      vehicle_id: wo.vehicle_id,
      job: job.length > 200 ? job.slice(0, 197) + '...' : job,
      notes: 'Created from Digital Vehicle Inspection — customer approved items for service.',
      status: autoSend ? 'Sent' : 'Draft',
      shop_id: wo.shop_id,
    })
    .select()
    .single();

  if (estError) {
    return internalError(estError);
  }

  // Create labor lines — one per selected item with 1 hour default
  const laborLines = selectedItems.map(
    (item: { category: string; item: string }, i: number) => ({
      estimate_id: estimate.id,
      description: `${item.category} — ${item.item}`,
      hours: 1,
      rate: laborRate,
      sort_order: i,
    })
  );

  await supabase.from('estimate_labor_lines').insert(laborLines);

  // Get customer info for SMS
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, email')
    .eq('id', wo.customer_id)
    .single();

  if (autoSend) {
    // Build portal URL for the estimate
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
    const portalUrl = `${origin}/portal/${estimate.portal_token}`;

    // Best-effort: send SMS with estimate link
    if (customer?.phone && shopSecrets?.twilio_account_sid && shopSecrets?.twilio_auth_token && shop?.twilio_phone_number) {
      try {
        const shopName = shop.name || 'Your Shop';
        const smsBody = `${shopName}: Your estimate ${estimate.display_id} for recommended services is ready. Review and approve here: ${portalUrl}`;
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${shopSecrets.twilio_account_sid}/Messages.json`;
        await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${shopSecrets.twilio_account_sid}:${shopSecrets.twilio_auth_token}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: customer.phone,
            From: shop.twilio_phone_number,
            Body: smsBody,
          }),
        });
      } catch {
        // SMS is best-effort
      }
    }

    // Create notification for shop staff
    await supabase.from('notifications').insert({
      customer_id: wo.customer_id,
      work_order_id: wo.id,
      type: 'dvi_approved',
      channel: 'system',
      message: `${customer?.name || 'Customer'} approved ${selectedItems.length} inspection item${selectedItems.length > 1 ? 's' : ''}. Estimate ${estId} created and sent.`,
      sent_at: new Date().toISOString(),
      shop_id: wo.shop_id,
    });
  } else {
    // Draft mode — notify shop to review
    await supabase.from('notifications').insert({
      customer_id: wo.customer_id,
      work_order_id: wo.id,
      type: 'dvi_approved',
      channel: 'system',
      message: `${customer?.name || 'Customer'} approved ${selectedItems.length} inspection item${selectedItems.length > 1 ? 's' : ''}. Draft estimate ${estId} created — review and send to customer.`,
      sent_at: new Date().toISOString(),
      shop_id: wo.shop_id,
    });
  }

  return NextResponse.json({ ok: true, estimate_id: estimate.id });
}
