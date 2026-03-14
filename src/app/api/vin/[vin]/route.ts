import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vin: string }> }
) {
  const { vin } = await params;

  if (!vin || vin.length !== 17) {
    return NextResponse.json({ error: 'Invalid VIN — must be 17 characters' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'NHTSA API request failed' }, { status: 502 });
    }

    const json = await res.json();
    const results: { VariableId: number; Value: string | null }[] = json.Results || [];

    const getValue = (variableId: number) => {
      const entry = results.find((r) => r.VariableId === variableId);
      return entry?.Value?.trim() || null;
    };

    const make = getValue(26);
    const model = getValue(28);
    const year = getValue(29);

    if (!make && !model && !year) {
      return NextResponse.json({ error: 'Could not decode VIN' }, { status: 404 });
    }

    return NextResponse.json({ year, make, model });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to decode VIN' },
      { status: 500 }
    );
  }
}
