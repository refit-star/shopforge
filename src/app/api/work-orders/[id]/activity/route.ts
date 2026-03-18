import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('wo_activity_log')
    .select('*')
    .eq('work_order_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data || []);
}
