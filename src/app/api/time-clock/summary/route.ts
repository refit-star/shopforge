import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// GET — summary for today's shift hours per tech
export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data, error } = await supabase
    .from('time_entries')
    .select('*, tech:techs(id, name, color)')
    .gte('clock_in', dayStart)
    .lte('clock_in', dayEnd)
    .order('clock_in', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
