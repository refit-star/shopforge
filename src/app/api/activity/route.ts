import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('wo_activity_log')
    .select('*, work_order:work_orders(id, display_id)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}
