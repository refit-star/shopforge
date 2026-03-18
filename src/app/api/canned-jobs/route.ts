import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('canned_jobs')
    .select('*')
    .eq('active', true)
    .order('name');

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();

  const { name, description, labor_lines, parts_lines, bookable, duration_minutes } = body;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('canned_jobs')
    .insert({
      name,
      description: description || null,
      labor_lines: labor_lines || [],
      parts_lines: parts_lines || [],
      bookable: bookable ?? false,
      duration_minutes: duration_minutes ?? 60,
    })
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}
