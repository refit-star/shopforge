import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { plate, state } = body;

  if (!plate || !state) {
    return NextResponse.json({ error: 'plate and state are required' }, { status: 400 });
  }

  const cleanPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const cleanState = state.trim().toUpperCase();

  if (!cleanPlate || cleanPlate.length < 2 || cleanPlate.length > 8) {
    return NextResponse.json({ error: 'Invalid plate number' }, { status: 400 });
  }
  if (!/^[A-Z]{2}$/.test(cleanState)) {
    return NextResponse.json({ error: 'State must be a 2-letter code' }, { status: 400 });
  }

  // Check cache (same plate+state looked up in last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from('plate_lookups')
    .select('vin, year, make, model')
    .eq('plate', cleanPlate)
    .eq('state', cleanState)
    .gte('created_at', thirtyDaysAgo)
    .not('vin', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      vin: cached.vin, year: cached.year, make: cached.make, model: cached.model, cached: true,
    });
  }

  // Rate limit: 100 lookups per day per shop
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('plate_lookups')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', todayStart.toISOString());

  if ((count || 0) >= 100) {
    return NextResponse.json({ error: 'Daily plate lookup limit reached (100/day)' }, { status: 429 });
  }

  // Resolve API key: per-shop override → platform env var
  const { data: shop } = await supabase
    .from('shops')
    .select('plate_lookup_api_key')
    .single();

  const apiKey = shop?.plate_lookup_api_key || process.env.PLATE_LOOKUP_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Plate lookup not configured. Add an API key in Settings → Integrations, or contact support.' },
      { status: 503 },
    );
  }

  // Call PlateToVIN API
  try {
    const apiRes = await fetch('https://platetovin.net/api/convert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ plate: cleanPlate, state: cleanState }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => 'Unknown error');
      // Cache the miss so we don't hammer the API
      await supabase.from('plate_lookups').insert({
        plate: cleanPlate, state: cleanState,
        raw_response: { error: errText, status: apiRes.status },
      });
      return NextResponse.json(
        { error: 'Plate lookup failed. Please enter vehicle info manually.' },
        { status: 502 },
      );
    }

    const data = await apiRes.json();

    const vin = data.vin?.trim() || null;
    const year = data.year ? parseInt(String(data.year), 10) : null;
    const make = data.make?.trim() || null;
    const model = data.model?.trim() || null;

    // Cache result
    await supabase.from('plate_lookups').insert({
      plate: cleanPlate, state: cleanState, vin, year, make, model, raw_response: data,
    });

    if (!vin && !make && !model) {
      return NextResponse.json(
        { error: 'No vehicle found for this plate + state combination.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ vin, year, make, model });
  } catch {
    return NextResponse.json(
      { error: 'Network error contacting plate lookup service.' },
      { status: 502 },
    );
  }
}
