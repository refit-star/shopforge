import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('wo_photos')
    .select('*')
    .eq('work_order_id', id)
    .order('created_at');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const caption = (formData.get('caption') as string) || null;

  if (!file) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // Resolve shop_id from the work order
  const { data: wo } = await supabase
    .from('work_orders')
    .select('shop_id')
    .eq('id', id)
    .single();

  if (!wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${wo.shop_id}/${id}/${Date.now()}-${fileName}`;
  const contentType = file.type || 'application/octet-stream';

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from('wo-photos')
    .upload(filePath, fileBuffer, { contentType });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = admin.storage
    .from('wo-photos')
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  const { data, error } = await supabase
    .from('wo_photos')
    .insert({
      work_order_id: id,
      url: publicUrl,
      caption,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const supabase = createServerClient();
  const body = await req.json();
  const { photo_id } = body;

  if (!photo_id) {
    return NextResponse.json({ error: 'photo_id is required' }, { status: 400 });
  }

  // Fetch the photo record to get the storage path before deleting
  const { data: photo } = await supabase
    .from('wo_photos')
    .select('url')
    .eq('id', photo_id)
    .single();

  const { error } = await supabase.from('wo_photos').delete().eq('id', photo_id);

  // Clean up storage file (best-effort — don't fail if storage delete fails)
  if (!error && photo?.url) {
    try {
      const match = photo.url.match(/\/wo-photos\/(.+)$/);
      if (match) {
        const admin = createAdminClient();
        await admin.storage.from('wo-photos').remove([decodeURIComponent(match[1])]);
      }
    } catch {
      // Storage cleanup is best-effort
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
