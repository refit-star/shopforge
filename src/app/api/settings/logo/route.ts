import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function DELETE() {
  const supabase = createServerClient();

  // Step 1: verify we can read the shop
  const { data: shop, error: readErr } = await supabase
    .from('shops')
    .select('id, logo_url')
    .single();

  if (readErr || !shop) {
    return NextResponse.json(
      { error: `DEBUG: shop read failed: ${readErr?.message || 'no shop found'}` },
      { status: 500 }
    );
  }

  // Step 2: update logo_url to null
  const { error: updateErr } = await supabase
    .from('shops')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', shop.id);

  if (updateErr) {
    return NextResponse.json(
      { error: `DEBUG: update failed: ${updateErr.message}` },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: `DEBUG: storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: `DEBUG: db update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ logo_url: logoUrl });
}
