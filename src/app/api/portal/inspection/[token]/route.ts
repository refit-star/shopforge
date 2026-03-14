import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = createAdminClient();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Fetch inspection by portal_token
  const { data: inspection } = await supabase
    .from('inspections')
    .select('*, inspection_items(*, inspection_item_media(*))')
    .eq('portal_token', token)
    .single();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Get work order with customer + vehicle info
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, display_id, shop_id, customer:customers(id, name, phone, email), vehicle:vehicles(id, year, make, model, vin, plate)')
    .eq('id', inspection.work_order_id)
    .single();

  if (!wo) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 });
  }

  // Get shop branding
  const { data: shop } = await supabase
    .from('shops')
    .select('name, address, phone, email, logo_url')
    .eq('id', wo.shop_id)
    .single();

  // Format items with media
  const items = (inspection.inspection_items || [])
    .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    .map((item: { inspection_item_media?: unknown[]; [k: string]: unknown }) => ({
      ...item,
      media: item.inspection_item_media || [],
    }));

  return NextResponse.json({
    inspection: {
      id: inspection.id,
      created_at: inspection.created_at,
      items,
    },
    work_order: {
      id: wo.id,
      display_id: wo.display_id,
      customer: wo.customer,
      vehicle: wo.vehicle,
    },
    shop: shop ? {
      shop_name: shop.name,
      address: shop.address,
      phone: shop.phone,
      email: shop.email,
      logo_url: shop.logo_url,
    } : null,
  });
}
