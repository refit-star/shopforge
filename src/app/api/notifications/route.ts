import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  let query = supabase
    .from('notifications')
    .select('*, customer:customers(id, name)')
    .order('created_at', { ascending: false })
    .limit(50);

  const unreadOnly = req.nextUrl.searchParams.get('unread');
  if (unreadOnly === 'true') {
    query = query.is('read_at', null);
  }

  const { data, error } = await query;

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ updated: ids.length });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { work_order_id, customer_id, type, channel, message } = body;

  if (!customer_id || !type || !channel || !message) {
    return NextResponse.json(
      { error: 'customer_id, type, channel, and message are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      work_order_id: work_order_id || null,
      customer_id,
      type,
      channel,
      message,
      sent_at: body.send ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
