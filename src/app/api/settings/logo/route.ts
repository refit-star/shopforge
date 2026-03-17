import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function DELETE() {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('shops')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    return internalError(error, 'logo delete');
  }

  return NextResponse.json({ logo_url: null });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use PNG, JPG, or WebP.' }, { status: 400 });
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
      upsert: true,
    });

  if (uploadError) {
    return internalError(uploadError, `logo upload (type=${file.type}, size=${file.size})`);
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
    return internalError(updateError);
  }

  return NextResponse.json({ logo_url: logoUrl });
}
