import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { normalizePhone } from '@/lib/phone';
import { internalError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const q = req.nextUrl.searchParams.get('q')?.trim() || '';
  const filter = req.nextUrl.searchParams.get('filter') || '';

  // Fetch recent messages (capped at 2000 to avoid full table scan)
  const { data: messages, error } = await supabase
    .from('sms_messages')
    .select('id, customer_id, direction, phone_number, body, created_at')
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    return internalError(error);
  }

  // Fetch customers for name lookup
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone');

  const customerMap = new Map<string, { id: string; name: string; phone: string | null }>();
  (customers || []).forEach((c) => customerMap.set(c.id, c));

  // Build a name lookup by normalized phone for search matching
  const phoneToCustomer = new Map<string, { id: string; name: string }>();
  (customers || []).forEach((c) => {
    if (c.phone) {
      phoneToCustomer.set(normalizePhone(c.phone), { id: c.id, name: c.name });
    }
  });

  // Group by phone_number into conversations
  const convMap = new Map<
    string,
    {
      phone_number: string;
      customer_id: string | null;
      customer_name: string | null;
      last_message: string;
      last_direction: string;
      last_at: string;
      message_count: number;
      has_unread: boolean;
    }
  >();

  for (const msg of messages || []) {
    const norm = normalizePhone(msg.phone_number);
    if (!convMap.has(norm)) {
      // Resolve customer name
      let customerName: string | null = null;
      let customerId: string | null = msg.customer_id;
      if (customerId && customerMap.has(customerId)) {
        customerName = customerMap.get(customerId)!.name;
      } else if (phoneToCustomer.has(norm)) {
        const match = phoneToCustomer.get(norm)!;
        customerName = match.name;
        customerId = match.id;
      }

      convMap.set(norm, {
        phone_number: msg.phone_number,
        customer_id: customerId,
        customer_name: customerName,
        last_message: msg.body,
        last_direction: msg.direction,
        last_at: msg.created_at,
        message_count: 1,
        has_unread: msg.direction === 'inbound',
      });
    } else {
      const conv = convMap.get(norm)!;
      conv.message_count++;
      // If we haven't seen an outbound yet and this is outbound, mark as read
      if (conv.has_unread && msg.direction === 'outbound') {
        conv.has_unread = false;
      }
    }
  }

  let conversations = Array.from(convMap.values());

  // Filter: unlinked only
  if (filter === 'unlinked') {
    conversations = conversations.filter((c) => !c.customer_id);
  }

  // Search filter
  if (q) {
    const lower = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    conversations = conversations.filter((c) => {
      if (c.customer_name && c.customer_name.toLowerCase().includes(lower)) return true;
      if (digits && normalizePhone(c.phone_number).includes(digits)) return true;
      return false;
    });
  }

  // Sort by last message time (newest first)
  conversations.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

  return NextResponse.json(conversations);
}
