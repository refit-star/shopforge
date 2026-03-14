import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings } from '@/lib/settings-server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, message, notification_id, customer_id } = body;

  if (!to || !message) {
    return NextResponse.json(
      { error: 'to and message are required' },
      { status: 400 }
    );
  }

  // Fetch unmasked settings
  const settings = await getFullSettings();
  if (
    !settings ||
    !settings.twilio_account_sid ||
    !settings.twilio_auth_token ||
    !settings.twilio_phone_number
  ) {
    return NextResponse.json(
      { error: 'SMS not configured \u2014 add your Twilio credentials in Settings' },
      { status: 400 }
    );
  }

  const { twilio_account_sid, twilio_auth_token, twilio_phone_number } = settings;

  try {
    const credentials = Buffer.from(`${twilio_account_sid}:${twilio_auth_token}`).toString('base64');

    const params = new URLSearchParams();
    params.append('From', twilio_phone_number);
    params.append('To', to);
    params.append('Body', message);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilio_account_sid}/Messages.json`,
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
    const supabase = createServerClient();
    await supabase.from('sms_messages').insert({
      customer_id: customer_id || null,
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
    return NextResponse.json(
      { error: 'Failed to send SMS: ' + (err instanceof Error ? err.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
