import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const inspectionItemId = formData.get('inspection_item_id') as string | null;

  if (!file || !inspectionItemId) {
    return NextResponse.json(
      { error: 'file and inspection_item_id are required' },
      { status: 400 }
    );
  }

  // Validate file type — explicit allowlist (no SVG — can contain scripts)
  const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const videoTypes = ['video/mp4', 'video/quicktime'];
  const isImage = imageTypes.includes(file.type);
  const isVideo = videoTypes.includes(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: 'Invalid file type. Use PNG, JPG, WebP, GIF, MP4, or MOV.' },
      { status: 400 }
    );
  }

  // 50MB limit for videos, 10MB for images
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large. Max ${isVideo ? '50MB' : '10MB'}` },
      { status: 400 }
    );
  }

  // Resolve shop_id from the work order (RLS-scoped)
  const { data: wo } = await supabase
    .from('work_orders')
    .select('shop_id')
    .eq('id', id)
    .single();

  if (!wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  // Get current media count for sort_order
  const { count } = await supabase
    .from('inspection_item_media')
    .select('*', { count: 'exact', head: true })
    .eq('inspection_item_id', inspectionItemId);

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${wo.shop_id}/inspections/${inspectionItemId}/${Date.now()}-${fileName}`;
  const contentType = file.type || 'application/octet-stream';

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from('inspection-media')
    .upload(filePath, fileBuffer, { contentType });

  if (uploadError) {
    return internalError(uploadError);
  }

  const { data: urlData } = admin.storage
    .from('inspection-media')
    .getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('inspection_item_media')
    .insert({
      inspection_item_id: inspectionItemId,
      url: urlData.publicUrl,
      media_type: isVideo ? 'video' : 'image',
      sort_order: (count ?? 0),
    })
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const mediaId = formData.get('media_id') as string | null;

  if (!file || !mediaId) {
    return NextResponse.json(
      { error: 'file and media_id are required' },
      { status: 400 }
    );
  }

  // Resolve shop_id from work order
  const { data: wo } = await supabase
    .from('work_orders')
    .select('shop_id')
    .eq('id', id)
    .single();

  if (!wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  // Get the media record to find the inspection_item_id for the path
  const { data: mediaRecord } = await supabase
    .from('inspection_item_media')
    .select('inspection_item_id, annotated_url')
    .eq('id', mediaId)
    .single();

  if (!mediaRecord) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }

  // Delete old annotated file if replacing (best-effort)
  const admin = createAdminClient();
  if (mediaRecord.annotated_url) {
    try {
      const match = mediaRecord.annotated_url.match(/\/inspection-media\/(.+)$/);
      if (match) {
        await admin.storage.from('inspection-media').remove([decodeURIComponent(match[1])]);
      }
    } catch {
      // best-effort
    }
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const filePath = `${wo.shop_id}/inspections/${mediaRecord.inspection_item_id}/${Date.now()}-annotated.jpg`;

  const { error: uploadError } = await admin.storage
    .from('inspection-media')
    .upload(filePath, fileBuffer, { contentType: 'image/jpeg' });

  if (uploadError) {
    return internalError(uploadError);
  }

  const { data: urlData } = admin.storage
    .from('inspection-media')
    .getPublicUrl(filePath);

  const { data, error } = await supabase
    .from('inspection_item_media')
    .update({ annotated_url: urlData.publicUrl })
    .eq('id', mediaId)
    .select()
    .single();

  if (error) {
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const supabase = createServerClient();
  const body = await req.json();
  const { media_id } = body;

  if (!media_id) {
    return NextResponse.json({ error: 'media_id is required' }, { status: 400 });
  }

  // Fetch the record to get storage path
  const { data: media } = await supabase
    .from('inspection_item_media')
    .select('url')
    .eq('id', media_id)
    .single();

  const { error } = await supabase
    .from('inspection_item_media')
    .delete()
    .eq('id', media_id);

  // Clean up storage (best-effort)
  if (!error && media?.url) {
    try {
      const match = media.url.match(/\/inspection-media\/(.+)$/);
      if (match) {
        const admin = createAdminClient();
        await admin.storage
          .from('inspection-media')
          .remove([decodeURIComponent(match[1])]);
      }
    } catch {
      // Storage cleanup is best-effort
    }
  }

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ ok: true });
}
