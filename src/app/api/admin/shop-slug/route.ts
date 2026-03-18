import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

/** Public endpoint — returns only the slug for a shop_id.
 *  Used by /auth/callback to redirect to the correct login page.
 *  No sensitive data exposed. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('shops')
    .select('slug')
    .eq('id', id)
    .single();

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ slug: data.slug });
}
