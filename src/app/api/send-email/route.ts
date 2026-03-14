import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings } from '@/lib/settings-server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, subject, html, notification_id } = body;

  if (!to || !subject || !html) {
    return NextResponse.json(
      { error: 'to, subject, and html are required' },
      { status: 400 }
    );
  }

  // Fetch unmasked settings
  const settings = await getFullSettings();
  if (!settings || !settings.resend_api_key) {
    return NextResponse.json(
      { error: 'Email not configured \u2014 add your Resend API key in Settings' },
      { status: 400 }
    );
  }

  const fromName = settings.shop_name || 'ShopForge';
  const fromEmail = 'onboarding@resend.dev';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.resend_api_key}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: resData.message || 'Failed to send email via Resend' },
        { status: res.status }
      );
    }

    // Update notification status if provided
    if (notification_id) {
      const supabase = createServerClient();
      await supabase
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notification_id);
    }

    return NextResponse.json({ success: true, id: resData.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to send email: ' + (err instanceof Error ? err.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
