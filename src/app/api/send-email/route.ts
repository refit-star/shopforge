import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getFullSettings, resolveResendKey } from '@/lib/settings-server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, subject, html, notification_id } = body;

  if (!to || !subject || !html) {
    return NextResponse.json(
      { error: 'to, subject, and html are required' },
      { status: 400 }
    );
  }

  // Fetch unmasked settings and resolve Resend key
  const settings = await getFullSettings();
  const apiKey = resolveResendKey(settings);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email not configured — no Resend API key found' },
      { status: 400 }
    );
  }

  const fromName = settings?.shop_name || 'ShopForge';
  const fromEmail = 'notifications@send.refit.build';
  const replyTo = settings?.email || undefined;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(to) ? to : [to],
        reply_to: replyTo,
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
