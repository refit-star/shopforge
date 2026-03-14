import { NextRequest, NextResponse } from 'next/server';
import { getFullSettings } from '@/lib/settings-server';
import { searchParts } from '@/lib/partstech';

export async function POST(req: NextRequest) {
  const settings = await getFullSettings();
  if (!settings?.partstech_username || !settings?.partstech_api_key) {
    return NextResponse.json(
      { error: 'PartsTech is not configured. Add credentials in Settings.' },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { query, vehicle } = body;

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const results = await searchParts(
    { username: settings.partstech_username, apiKey: settings.partstech_api_key },
    query,
    vehicle
  );

  return NextResponse.json({ results });
}
