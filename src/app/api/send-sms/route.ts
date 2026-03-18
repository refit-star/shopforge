import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings, resolveTwilioCreds } from '@/lib/settings-server';
import { normalizePhone } from '@/lib/phone';
import { internalError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, message, notification_id, customer_id } = body;

  if (!to || !message) {
    return NextResponse.json(
      { error: 'to and message are required' },
      { status: 400 }
    );
  }

  // Validate the "to" number belongs to a customer in this shop
  const supabase = createServerClient();
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo || normalizedTo.length < 7) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  const { data: customers } = await supabase
    .from('customers')
    .select('id, phone')
    .not('phone', 'is', null);

  const matchedCustomer = customers?.find(
    (c) => c.phone && normalizePhone(c.phone) === normalizedTo
  );

  if (!matchedCustomer) {
    return NextResponse.json(
      { error: 'Phone number does not match any customer in your shop' },
      { status: 403 }
    );
  }

  // Fetch unmasked settings and resolve Twilio credentials
  const settings = await getFullSettings();
  if (!settings || !settings.twilio_phone_number) {
    return NextResponse.json(
      { error: 'SMS not configured — no Twilio phone number set' },
      { status: 400 }
    );
  }

  const twilio = resolveTwilioCreds(settings);
  if (!twilio) {
    return NextResponse.json(
      { error: 'SMS not configured — Twilio credentials not found' },
      { status: 400 }
    );
  }

  try {
    const credentials = Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64');

    const params = new URLSearchParams();
    params.append('From', settings.twilio_phone_number);
    params.append('To', to);
    params.append('Body', message);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const resData = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: resData.message || resData.more_info || 'Failed to send SMS via Twilio' },
        { status: res.status }
      );
    }

    // Log outbound message to sms_messages
    await supabase.from('sms_messages').insert({
      customer_id: customer_id || matchedCustomer.id || null,
      direction: 'outbound',
      phone_number: to,
      body: message,
      twilio_message_sid: resData.sid,
    });

    // Update notification status if provided
    if (notification_id) {
      await supabase
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notification_id);
    }

    return NextResponse.json({ success: true, sid: resData.sid });
  } catch (err) {
    return internalError(err);
  }
}
