import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

// GET — time entries for a specific work order
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('time_entries')
    .select('*, tech:techs(id, name, color)')
    .eq('work_order_id', id)
    .eq('type', 'job')
    .order('clock_in', { ascending: false });

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}
