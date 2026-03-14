import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const supabase = createAdminClient();
  const date = req.nextUrl.searchParams.get('date'); // YYYY-MM-DD
  const duration = parseInt(req.nextUrl.searchParams.get('duration') || '60', 10);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date param required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Resolve shop
  const { data: shop } = await supabase
    .from('shops')
    .select('id, online_booking_enabled, hours_start, hours_end, booking_lead_hours, booking_window_days')
    .eq('slug', params.slug)
    .single();

  if (!shop || !shop.online_booking_enabled) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  const hoursStart = shop.hours_start ?? 8;
  const hoursEnd = shop.hours_end ?? 18;
  const leadHours = shop.booking_lead_hours ?? 2;
  const windowDays = shop.booking_window_days ?? 14;

  // Enforce booking_window_days server-side
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const requestedMs = Date.UTC(
    parseInt(date.slice(0, 4)),
    parseInt(date.slice(5, 7)) - 1,
    parseInt(date.slice(8, 10))
  );

  if (requestedMs < todayMs) {
    return NextResponse.json({ error: 'Cannot book in the past' }, { status: 400 });
  }

  const daysDiff = Math.floor((requestedMs - todayMs) / (1000 * 60 * 60 * 24));
  if (daysDiff >= windowDays) {
    return NextResponse.json({ error: `Bookings are only available up to ${windowDays} days in advance` }, { status: 400 });
  }

  // Fetch existing appointments for this date (shop times stored as UTC)
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: appointments } = await supabase
    .from('appointments')
    .select('start_time, duration_minutes')
    .eq('shop_id', shop.id)
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);

  // Build occupied intervals [startMin, endMin] relative to midnight UTC
  const occupied = (appointments || []).map(a => {
    const d = new Date(a.start_time);
    const startMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    return { start: startMin, end: startMin + a.duration_minutes };
  });

  // Generate slots within business hours
  // Slot step = 30 minutes (standard scheduling grid)
  const nowUtcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const isToday = date === todayStr;

  const slots: string[] = [];
  const startMin = hoursStart * 60;
  const endMin = hoursEnd * 60;

  for (let m = startMin; m + duration <= endMin; m += 30) {
    // Check lead time: if today, slot must be at least leadHours from now
    if (isToday && m < nowUtcMin + leadHours * 60) continue;

    // Check for overlap with existing appointments
    const slotEnd = m + duration;
    const conflict = occupied.some(
      o => m < o.end && slotEnd > o.start
    );
    if (conflict) continue;

    // Build ISO time string
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${date}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`);
  }

  return NextResponse.json({ slots });
}
