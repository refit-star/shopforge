import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name),
      tech:techs(id, name, color),
      wo_labor_lines(description, hours, rate),
      wo_parts_lines(name, qty, price)
    `)
    .eq('vehicle_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = (data || []).map((wo) => {
    const laborLines = (wo.wo_labor_lines as { hours: number; rate: number }[]) || [];
    const partsLines = (wo.wo_parts_lines as { qty: number; price: number }[]) || [];

    const labor_total = laborLines.reduce(
      (sum, l) => sum + Number(l.hours) * Number(l.rate),
      0
    );
    const parts_total = partsLines.reduce(
      (sum, p) => sum + Number(p.qty) * Number(p.price),
      0
    );

    return {
      ...wo,
      labor_total: Math.round(labor_total * 100) / 100,
      parts_total: Math.round(parts_total * 100) / 100,
      estimated_total: Math.round((labor_total + parts_total) * 100) / 100,
    };
  });

  return NextResponse.json(enriched);
}
