import { NextRequest, NextResponse } from 'next/server';
import { getFullSettings, resolveTwilioCreds, resolveResendKey } from '@/lib/settings-server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { service } = body;

  const settings = await getFullSettings();
  if (!settings) {
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 });
  }

  if (service === 'resend') {
    const resendKey = resolveResendKey(settings);
    if (!resendKey) {
      return NextResponse.json(
        { error: 'No Resend API key configured' },
        { status: 400 }
      );
    }

    const shopEmail = settings.email;
    if (!shopEmail) {
      return NextResponse.json(
        { error: 'No shop email configured to send test to' },
        { status: 400 }
      );
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: `${settings.shop_name || 'ShopForge'} <notifications@send.refit.build>`,
          to: [shopEmail],
          subject: 'ShopForge Test Email',
          html: `<div style="font-family:Arial,sans-serif;max-width:400px;margin:0 auto;padding:24px">
            <h2 style="color:#f97316;margin:0 0 12px">Test Email Successful</h2>
            <p style="color:#334155;font-size:14px;margin:0">Your Resend integration is working correctly. Emails sent from ShopForge will come from this service.</p>
            <p style="color:#94a3b8;font-size:12px;margin:16px 0 0">${settings.shop_name || 'ShopForge'}</p>
          </div>`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data.message || 'Resend API error' },
          { status: res.status }
        );
      }

      return NextResponse.json({ success: true, message: `Test email sent to ${shopEmail}` });
    } catch (err) {
      return NextResponse.json(
        { error: 'Connection failed: ' + (err instanceof Error ? err.message : 'Unknown error') },
        { status: 500 }
      );
    }
  }

  if (service === 'twilio') {
    const twilio = resolveTwilioCreds(settings);
    if (!twilio || !settings.twilio_phone_number) {
      return NextResponse.json(
        { error: 'Twilio credentials not fully configured' },
        { status: 400 }
      );
    }

    const shopPhone = settings.phone;
    if (!shopPhone) {
      return NextResponse.json(
        { error: 'No shop phone number configured to send test to' },
        { status: 400 }
      );
    }

    try {
      const credentials = Buffer.from(
        `${twilio.sid}:${twilio.token}`
      ).toString('base64');

      const params = new URLSearchParams();
      params.append('From', settings.twilio_phone_number);
      params.append('To', shopPhone);
      params.append('Body', `ShopForge test: Your Twilio SMS integration is working correctly.`);

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

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data.message || data.more_info || 'Twilio API error' },
          { status: res.status }
        );
      }

      return NextResponse.json({ success: true, message: `Test SMS sent to ${shopPhone}` });
    } catch (err) {
      return NextResponse.json(
        { error: 'Connection failed: ' + (err instanceof Error ? err.message : 'Unknown error') },
        { status: 500 }
      );
    }
  }

  if (service === 'stripe') {
    if (!settings.stripe_secret_key) {
      return NextResponse.json(
        { error: 'No Stripe secret key configured' },
        { status: 400 }
      );
    }

    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(settings.stripe_secret_key);
      const account = await stripe.accounts.retrieve();
      const name = account.settings?.dashboard?.display_name || account.id;
      return NextResponse.json({ success: true, message: `Connected to Stripe account: ${name}` });
    } catch (err) {
      return NextResponse.json(
        { error: 'Invalid Stripe key: ' + (err instanceof Error ? err.message : 'Unknown error') },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: 'Invalid service. Use "resend", "twilio", or "stripe".' }, { status: 400 });
}
