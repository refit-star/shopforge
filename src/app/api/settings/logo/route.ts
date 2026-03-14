import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use PNG, JPG, WebP, or SVG.' }, { status: 400 });
  }

  // Max 2MB
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 2MB.' }, { status: 400 });
  }

  // Resolve shop_id from authenticated user's shop
  const supabase = createServerClient();
  const { data: shop, error: shopError } = await supabase
    .from('shops')
    .select('id')
    .single();

  if (shopError || !shop) {
    return NextResponse.json({ error: 'Could not resolve shop' }, { status: 403 });
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${shop.id}/logo-${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage (admin client — bucket may require service role)
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from('logos')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = admin.storage
    .from('logos')
    .getPublicUrl(fileName);

  const logoUrl = urlData.publicUrl;

  // Save to shops table (server client — RLS scopes to user's shop)
  const { error: updateError } = await supabase
    .from('shops')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ logo_url: logoUrl });
}
