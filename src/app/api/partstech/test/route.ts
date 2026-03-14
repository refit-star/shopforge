import { NextResponse } from 'next/server';
import { getFullSettings } from '@/lib/settings-server';
import { testConnection } from '@/lib/partstech';

export async function POST() {
  const settings = await getFullSettings();
  if (!settings?.partstech_username || !settings?.partstech_api_key) {
    return NextResponse.json(
      { success: false, message: 'PartsTech credentials not configured' },
      { status: 400 }
    );
  }

  const result = await testConnection({
    username: settings.partstech_username,
    apiKey: settings.partstech_api_key,
  });

  return NextResponse.json(result);
}
