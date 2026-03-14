import { NextResponse } from 'next/server';
import { getFullSettings } from '@/lib/settings-server';

export async function GET() {
  const settings = await getFullSettings();
  if (!settings?.twilio_account_sid || !settings?.twilio_auth_token) {
    return NextResponse.json(
      { error: 'Twilio credentials not configured. Save your Account SID and Auth Token first.' },
      { status: 400 }
    );
  }

  try {
    const credentials = Buffer.from(
      `${settings.twilio_account_sid}:${settings.twilio_auth_token}`
    ).toString('base64');

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${settings.twilio_account_sid}/IncomingPhoneNumbers.json?PageSize=50`,
      {
        headers: { Authorization: `Basic ${credentials}` },
      }
    );

    if (!res.ok) {
      const data = await res.json();
      return NextResponse.json(
        { error: data.message || 'Failed to fetch Twilio numbers' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const numbers = (data.incoming_phone_numbers || []).map(
      (n: { phone_number: string; friendly_name: string }) => ({
        number: n.phone_number,
        label: n.friendly_name,
      })
    );

    return NextResponse.json({ numbers });
  } catch (err) {
    return NextResponse.json(
      { error: 'Connection failed: ' + (err instanceof Error ? err.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
