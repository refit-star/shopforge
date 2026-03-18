import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/phone';
import crypto from 'crypto';

/** Validate Twilio request signature (X-Twilio-Signature).
 *  https://www.twilio.com/docs/usage/security#validating-requests */
function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  // Sort param keys and append key+value to URL
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  const from = params.From || '';
  const to = params.To || '';
  const body = params.Body || '';
  const messageSid = params.MessageSid || '';

  if (!from || !to || !body) {
    return new NextResponse('<Response/>', {
      status: 400,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const supabase = createAdminClient();

  // Resolve shop by matching "To" number against shops' Twilio phone number
  const normalizedTo = normalizePhone(to);

  // Get shops with their Twilio phone numbers
  const { data: allShops } = await supabase
    .from('shops')
    .select('id, twilio_phone_number')
    .not('twilio_phone_number', 'is', null);

  // Fetch secrets for all shops with Twilio numbers
  const shopIds = (allShops || []).map(s => s.id);
  const { data: allSecrets } = shopIds.length > 0
    ? await supabase.from('shop_secrets').select('shop_id, twilio_auth_token').in('shop_id', shopIds)
    : { data: [] };

  const platformToken = process.env.TWILIO_AUTH_TOKEN || '';
  const secretMap = new Map((allSecrets || []).map(s => [s.shop_id, s.twilio_auth_token]));
  const shops = (allShops || []).map(s => ({
    ...s,
    twilio_auth_token: secretMap.get(s.id) || platformToken || null,
  }));

  if (!shops || shops.length === 0) {
    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const shop = shops.find(
    (s) => s.twilio_phone_number && normalizePhone(s.twilio_phone_number) === normalizedTo
  );

  if (!shop) {
    return new NextResponse('<Response/>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Validate Twilio signature
  const signature = req.headers.get('x-twilio-signature') || '';
  if (!signature || !shop.twilio_auth_token) {
    return new NextResponse('<Response/>', {
      status: 403,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Build the URL Twilio actually called (Vercel may rewrite req.url internally)
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || '';
  const url = `${proto}://${host}/api/twilio/webhook`;

  try {
    const valid = validateTwilioSignature(shop.twilio_auth_token, signature, url, params);
    if (!valid) {
      return new NextResponse('<Response/>', {
        status: 403,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
  } catch {
    // timingSafeEqual throws if buffer lengths differ
    return new NextResponse('<Response/>', {
      status: 403,
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Match "From" phone to a customer in this shop
  const normalizedFrom = normalizePhone(from);

  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('shop_id', shop.id)
    .not('phone', 'is', null);

  const customer = customers?.find(
    (c) => c.phone && normalizePhone(c.phone) === normalizedFrom
  ) || null;

  // Store the inbound message (explicit shop_id since we bypass RLS)
  await supabase.from('sms_messages').insert({
    shop_id: shop.id,
    customer_id: customer?.id || null,
    direction: 'inbound',
    phone_number: from,
    body,
    twilio_message_sid: messageSid,
  });

  // Return empty TwiML (no auto-reply)
  return new NextResponse('<Response/>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
