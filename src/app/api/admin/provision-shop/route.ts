import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import crypto from 'crypto';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per hour per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(`admin-provision:${ip}`, 5, 3600000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Auth: require admin key with timing-safe comparison
  const adminKey = (process.env.ADMIN_PROVISION_KEY || '').trim();
  const key = (req.headers.get('x-admin-key') || '').trim();

  if (!adminKey || !key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    if (!crypto.timingSafeEqual(Buffer.from(key), Buffer.from(adminKey))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    // Buffer length mismatch
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { shop_name, slug, owner_email, owner_name, area_code } = body;

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
    return NextResponse.json({ error: 'Failed to create shop' }, { status: 500 });
  }

  // 2b. Create shop_secrets row for the new shop
  await supabase.from('shop_secrets').insert({ shop_id: shop.id });

  // 2c. Auto-provision Twilio phone number if area_code provided and platform creds exist
  let provisionedNumber: string | null = null;
  if (area_code && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const credentials = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const webhookUrl = `${req.nextUrl.origin}/api/twilio/webhook`;

      // Search for available number in the area code
      const searchRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${area_code}&SmsEnabled=true&Limit=1`,
        { headers: { Authorization: `Basic ${credentials}` } }
      );
      const searchData = await searchRes.json();
      const available = searchData.available_phone_numbers?.[0];

      if (available) {
        // Buy the number
        const buyParams = new URLSearchParams();
        buyParams.append('PhoneNumber', available.phone_number);
        buyParams.append('SmsUrl', webhookUrl);
        buyParams.append('SmsMethod', 'POST');
        buyParams.append('FriendlyName', `ShopForge - ${shop_name}`);

        const buyRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: buyParams.toString(),
          }
        );

        if (buyRes.ok) {
          const buyData = await buyRes.json();
          provisionedNumber = buyData.phone_number;
          // Assign to shop
          await supabase.from('shops').update({ twilio_phone_number: provisionedNumber }).eq('id', shop.id);
        }
      }
    } catch {
      // Best-effort — don't fail provisioning if number buy fails
      console.error('[provision-shop] Twilio number provisioning failed');
    }
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
        return NextResponse.json({ error: 'Failed to find user' }, { status: 500 });
      }
      const found = users.find((u) => u.email === owner_email);
      if (!found) {
        return NextResponse.json({ error: 'User exists but could not be found' }, { status: 500 });
      }
      userId = found.id;
    } else {
      // Clean up: delete the shop we just created
      await supabase.from('shops').delete().eq('id', shop.id);
      return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 });
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
    return NextResponse.json({ error: 'Failed to create shop mapping' }, { status: 500 });
  }

  return NextResponse.json({
    shop_id: shop.id,
    slug: shop.slug,
    user_id: userId,
    login_url: `${baseUrl}/login/${slug}`,
    twilio_phone_number: provisionedNumber || null,
    message: `Shop "${shop_name}" provisioned.${provisionedNumber ? ` Twilio number ${provisionedNumber} assigned.` : ''} Invite sent to ${owner_email}.`,
  }, { status: 201 });
}
