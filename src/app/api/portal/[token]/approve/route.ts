import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Parse body (may be empty for legacy/dashboard calls)
  const body = await req.json().catch(() => ({}));
  const signerName: string | undefined = body.signer_name;
  const signatureData: string | undefined = body.signature_data;

  // Find the estimate by portal_token (include full data for snapshot)
  const { data: estimate, error: findError } = await supabase
    .from('estimates')
    .select(`
      id, shop_id, display_id, status, job, notes, valid_until, created_at,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, plate),
      estimate_labor_lines(id, description, hours, rate, sort_order),
      estimate_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('portal_token', token)
    .single();

  if (findError || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  }

  // Only allow approving estimates that are in 'Sent' or 'Draft' status
  if (estimate.status === 'Approved') {
    return NextResponse.json({ message: 'Estimate already approved' });
  }

  if (estimate.status === 'Declined') {
    return NextResponse.json({ error: 'Estimate has been declined' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let signatureUrl: string | null = null;

  // Handle signature upload if provided
  if (signerName && signatureData) {
    // Strip data URL prefix
    const base64Match = signatureData.match(/^data:image\/png;base64,(.+)$/);
    const base64 = base64Match ? base64Match[1] : signatureData;
    const buffer = Buffer.from(base64, 'base64');

    // Upload to Supabase Storage: signatures/{shop_id}/{estimate_id}.png
    const storagePath = `${estimate.shop_id}/${estimate.id}.png`;
    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload signature' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from('signatures')
      .getPublicUrl(storagePath);

    signatureUrl = urlData.publicUrl;

    // Compute totals for snapshot
    const laborLines = (estimate.estimate_labor_lines as { hours: number; rate: number }[]) || [];
    const partsLines = (estimate.estimate_parts_lines as { qty: number; price: number }[]) || [];
    const laborTotal = laborLines.reduce((s, l) => s + Number(l.hours) * Number(l.rate), 0);
    const partsTotal = partsLines.reduce((s, p) => s + Number(p.qty) * Number(p.price), 0);

    // Build estimate snapshot (what the customer saw when they signed)
    const snapshot = {
      display_id: estimate.display_id,
      job: estimate.job,
      notes: estimate.notes,
      customer: estimate.customer,
      vehicle: estimate.vehicle,
      labor_lines: estimate.estimate_labor_lines,
      parts_lines: estimate.estimate_parts_lines,
      labor_total: Math.round(laborTotal * 100) / 100,
      parts_total: Math.round(partsTotal * 100) / 100,
      estimated_total: Math.round((laborTotal + partsTotal) * 100) / 100,
    };

    // Capture IP and user-agent
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Insert authorization record
    const { error: sigError } = await supabase.from('estimate_signatures').insert({
      shop_id: estimate.shop_id,
      estimate_id: estimate.id,
      signer_name: signerName,
      signature_url: signatureUrl,
      ip_address: ipAddress,
      user_agent: userAgent,
      approved_at: now,
      estimate_snapshot: snapshot,
    });

    if (sigError) {
      return NextResponse.json({ error: 'Failed to save signature record' }, { status: 500 });
    }
  }

  // Update status to Approved
  const updates: Record<string, unknown> = {
    status: 'Approved',
    updated_at: now,
    approved_at: now,
  };
  if (signerName) updates.approved_by = signerName;

  const { error: updateError } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', estimate.id);

  if (updateError) {
    return internalError(updateError);
  }

  // Best-effort: create notification for shop staff
  try {
    const customerRaw = estimate.customer as unknown;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] as { id: string; name: string; phone: string } | undefined : customerRaw as { id: string; name: string; phone: string } | null;

    await supabase.from('notifications').insert({
      shop_id: estimate.shop_id,
      customer_id: customer?.id || null,
      type: 'estimate_approved',
      channel: 'system',
      message: `${customer?.name || 'Customer'} approved estimate ${estimate.display_id}.${signerName ? ` Signed by ${signerName}.` : ''}`,
      status: 'delivered',
      sent_at: now,
    });

    // Optional SMS to shop phone if enabled in settings
    const { data: shop } = await supabase.from('shops').select('phone, sms_auto_templates').eq('id', estimate.shop_id).single();
    const templates = shop?.sms_auto_templates as Record<string, { enabled: boolean; template: string }> | null;
    const estApprovalTpl = templates?.['Estimate Approved'];

    if (estApprovalTpl?.enabled && shop?.phone) {
      const smsBody = (estApprovalTpl.template || '{{customer_name}} approved estimate {{display_id}}.')
        .replace(/\{\{customer_name\}\}/g, customer?.name || 'Customer')
        .replace(/\{\{display_id\}\}/g, estimate.display_id)
        .replace(/\{\{shop_name\}\}/g, '');  // shop doesn't need its own name

      // Fetch Twilio credentials (per-shop override or platform fallback)
      const { data: shopCredsRaw } = await supabase
        .from('shop_secrets')
        .select('twilio_account_sid, twilio_auth_token')
        .eq('shop_id', estimate.shop_id)
        .single();
      const shopCreds = {
        twilio_account_sid: shopCredsRaw?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '',
        twilio_auth_token: shopCredsRaw?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || '',
      };

      // Get twilio_phone_number from shops (not a secret)
      const { data: shopPhone } = await supabase
        .from('shops')
        .select('twilio_phone_number')
        .eq('id', estimate.shop_id)
        .single();

      if (shopCreds?.twilio_account_sid && shopCreds?.twilio_auth_token && shopPhone?.twilio_phone_number) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${shopCreds.twilio_account_sid}/Messages.json`;
        await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${shopCreds.twilio_account_sid}:${shopCreds.twilio_auth_token}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: shop.phone,
            From: shopPhone.twilio_phone_number,
            Body: smsBody,
          }),
        });
      }
    }
  } catch {
    // Notification is best-effort — never block approval
  }

  return NextResponse.json({
    message: 'Estimate approved successfully',
    signature_url: signatureUrl,
  });
}
