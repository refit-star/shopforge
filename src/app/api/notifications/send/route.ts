import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { notification_id, channel } = body;

  if (!notification_id) {
    return NextResponse.json({ error: 'notification_id is required' }, { status: 400 });
  }

  // In production, this would integrate with Twilio (SMS) or SendGrid (email)
  // For now, we mark the notification as sent
  const { data, error } = await supabase
    .from('notifications')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', notification_id)
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ ...data, delivered: true });
}
