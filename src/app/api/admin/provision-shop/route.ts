import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  // Auth: require admin key
  const adminKey = (process.env.ADMIN_PROVISION_KEY || '').trim();
  const key = (req.headers.get('x-admin-key') || '').trim();
  if (!adminKey || key !== adminKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { shop_name, slug, owner_email, owner_name } = body;

  // Validate required fields
  if (!shop_name || !slug || !owner_email) {
    return NextResponse.json(
      { error: 'Missing required fields: shop_name, slug, owner_email' },
      { status: 400 }
    );
  }

  // Validate slug format (lowercase alphanumeric + hyphens)
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length < 3) {
    return NextResponse.json(
      { error: 'Slug must be 3+ chars, lowercase alphanumeric and hyphens only' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 1. Check slug uniqueness
  const { data: existing } = await supabase
    .from('shops')
    .select('id')
    .eq('slug', slug)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });
  }

  // 2. Create shop
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .insert({
      name: shop_name,
      slug,
      owner_name: owner_name || '',
      owner_initials: owner_name
        ? owner_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
        : '',
    })
    .select('id, slug')
    .single();

  if (shopError) {
    return NextResponse.json({ error: shopError.message }, { status: 500 });
  }

  // 3. Invite auth user (or find existing)
  let userId: string;
  const baseUrl = req.nextUrl.origin;

  const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    owner_email,
    { redirectTo: `${baseUrl}/login/${slug}` }
  );

  if (inviteError) {
    // User might already exist
    if (inviteError.message.includes('already been registered')) {
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }
      const found = users.find((u) => u.email === owner_email);
      if (!found) {
        return NextResponse.json({ error: 'User exists but could not be found' }, { status: 500 });
      }
      userId = found.id;
    } else {
      // Clean up: delete the shop we just created
      await supabase.from('shops').delete().eq('id', shop.id);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
  } else {
    userId = inviteData.user.id;
  }

  // 4. Create user_shops mapping (trigger auto-sets app_metadata.shop_id)
  const { error: mappingError } = await supabase
    .from('user_shops')
    .insert({
      user_id: userId,
      shop_id: shop.id,
      role: 'owner',
    });

  if (mappingError) {
    // Clean up on failure
    await supabase.from('shops').delete().eq('id', shop.id);
    return NextResponse.json({ error: mappingError.message }, { status: 500 });
  }

  return NextResponse.json({
    shop_id: shop.id,
    slug: shop.slug,
    user_id: userId,
    login_url: `${baseUrl}/login/${slug}`,
    message: `Shop "${shop_name}" provisioned. Invite sent to ${owner_email} — they will set their password via email and land at ${baseUrl}/login/${slug}`,
  }, { status: 201 });
}
