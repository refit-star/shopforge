import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/phone';

/** GET /api/messages/[phone] — fetch thread for a phone number */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  const supabase = createServerClient();

  // Build possible phone formats to match in SQL
  const phonePatterns = [normalized, `+1${normalized}`, phone];
  if (normalized.length === 10) {
    phonePatterns.push(
      `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`,
      `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    );
  }
  const unique = Array.from(new Set(phonePatterns.filter(Boolean)));

  const { data: messages, error } = await supabase
    .from('sms_messages')
    .select('id, customer_id, direction, phone_number, body, twilio_message_sid, created_at')
    .in('phone_number', unique)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Resolve customer from the messages
  let customer = null;
  const customerId = (messages || []).find((m) => m.customer_id)?.customer_id;
  if (customerId) {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email')
      .eq('id', customerId)
      .single();
    customer = data;
  }

  return NextResponse.json({
    phone_number: phone,
    customer,
    messages: messages || [],
  });
}

/** PATCH /api/messages/[phone] — link all messages from this phone to a customer */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  const { phone } = await params;
  const normalized = normalizePhone(phone);
  const supabase = createServerClient();
  const body = await req.json();
  const { customer_id } = body;

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  // Build phone patterns
  const phonePatterns = [normalized, `+1${normalized}`, phone];
  if (normalized.length === 10) {
    phonePatterns.push(
      `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`,
      `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    );
  }
  const unique = Array.from(new Set(phonePatterns.filter(Boolean)));

  // Update all unlinked messages matching these phone patterns
  const { data: unlinked } = await supabase
    .from('sms_messages')
    .select('id')
    .in('phone_number', unique)
    .is('customer_id', null);

  const matchingIds = (unlinked || []).map((m) => m.id);

  if (matchingIds.length === 0) {
    return NextResponse.json({ linked: 0 });
  }

  const { error } = await supabase
    .from('sms_messages')
    .update({ customer_id })
    .in('id', matchingIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ linked: matchingIds.length });
}
