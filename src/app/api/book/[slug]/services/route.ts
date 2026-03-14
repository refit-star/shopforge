import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const supabase = createAdminClient();

  // Resolve shop by slug
  const { data: shop, error: shopErr } = await supabase
    .from('shops')
    .select('id, name, logo_url, address, phone, email, online_booking_enabled, booking_lead_hours, booking_window_days, hours_start, hours_end')
    .eq('slug', params.slug)
    .single();

  if (shopErr || !shop) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  if (!shop.online_booking_enabled) {
    return NextResponse.json({ error: 'Online booking is not available' }, { status: 404 });
  }

  // Fetch bookable canned jobs for this shop
  const { data: services } = await supabase
    .from('canned_jobs')
    .select('id, name, description, duration_minutes')
    .eq('shop_id', shop.id)
    .eq('active', true)
    .eq('bookable', true)
    .order('name');

  return NextResponse.json({
    shop: {
      name: shop.name,
      logo_url: shop.logo_url,
      address: shop.address,
      phone: shop.phone,
      email: shop.email,
      hours_start: shop.hours_start ?? 8,
      hours_end: shop.hours_end ?? 18,
      booking_lead_hours: shop.booking_lead_hours ?? 2,
      booking_window_days: shop.booking_window_days ?? 14,
    },
    services: services || [],
  });
}
