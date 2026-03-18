import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getShopSecrets } from '@/lib/secrets-server';
import { resolveTwilioCreds } from '@/lib/settings-server';

export async function POST() {
  const supabase = createServerClient();
  const today = new Date().toISOString().slice(0, 10);

  // Check if auto-send is enabled
  const { data: shop } = await supabase
    .from('shops')
    .select('name, phone, sms_auto_templates, twilio_phone_number')
    .limit(1)
    .single();

  const templates = shop?.sms_auto_templates as Record<string, { enabled: boolean; template: string }> | null;
  const tpl = templates?.['Service Reminder'];

  if (!tpl?.enabled) {
    return NextResponse.json({ message: 'Auto-send reminders disabled', sent: 0 });
  }

  const secrets = await getShopSecrets();
  const twilio = resolveTwilioCreds(secrets);
  if (!twilio || !shop?.twilio_phone_number) {
    return NextResponse.json({ message: 'Twilio not configured', sent: 0 });
  }

  // Atomically claim pending reminders that are due today or overdue
  // This prevents double-send when concurrent dashboard loads fire this route
  const { data: claimed } = await supabase
    .from('service_reminders')
    .update({ status: 'Sending' })
    .eq('status', 'Pending')
    .lte('due_date', today)
    .not('due_date', 'is', null)
    .select('*, customer:customers(id, name, phone)');

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ message: 'No due reminders', sent: 0 });
  }

  let sent = 0;
  const shopName = shop.name || 'Your Shop';

  for (const r of claimed) {
    const customer = r.customer as unknown as { id: string; name: string; phone: string } | null;
    if (!customer?.phone) {
      // Revert to Pending if no phone
      await supabase.from('service_reminders').update({ status: 'Pending' }).eq('id', r.id);
      continue;
    }

    const message = (tpl.template || '{{shop_name}}: Reminder — your {{service_type}} service is due. Call us at {{shop_phone}} to schedule.')
      .replace(/\{\{shop_name\}\}/g, shopName)
      .replace(/\{\{customer_name\}\}/g, customer.name || 'Customer')
      .replace(/\{\{service_type\}\}/g, r.service_type)
      .replace(/\{\{shop_phone\}\}/g, shop.phone || '')
      .replace(/\{\{due_date\}\}/g, r.due_date || '');

    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`;
      const res = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: customer.phone,
          From: shop.twilio_phone_number,
          Body: message,
        }),
      });

      if (res.ok) {
        await supabase
          .from('service_reminders')
          .update({ status: 'Sent' })
          .eq('id', r.id);
        sent++;
      } else {
        // Revert to Pending on failure so it can be retried
        await supabase.from('service_reminders').update({ status: 'Pending' }).eq('id', r.id);
      }
    } catch {
      // Revert to Pending on error
      await supabase.from('service_reminders').update({ status: 'Pending' }).eq('id', r.id);
    }
  }

  return NextResponse.json({ message: `Sent ${sent} reminder${sent !== 1 ? 's' : ''}`, sent });
}
