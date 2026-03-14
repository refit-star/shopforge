import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { INSPECTION_CATEGORIES } from '@/lib/types';

const INSPECTION_SELECT = '*, inspection_items(*, inspection_item_media(*))';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatInspection(raw: any) {
  if (!raw) return null;
  return {
    ...raw,
    items: (raw.inspection_items || [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((item: { inspection_item_media?: unknown[]; [k: string]: unknown }) => ({
        ...item,
        media: (item.inspection_item_media || []),
      })),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: inspection } = await supabase
    .from('inspections')
    .select(INSPECTION_SELECT)
    .eq('work_order_id', id)
    .single();

  if (!inspection) {
    return NextResponse.json(null);
  }

  return NextResponse.json(formatInspection(inspection));
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Check if one already exists
  const { data: existing } = await supabase
    .from('inspections')
    .select(INSPECTION_SELECT)
    .eq('work_order_id', id)
    .single();

  if (existing) {
    return NextResponse.json(formatInspection(existing));
  }

  // Create new inspection
  const { data: inspection, error } = await supabase
    .from('inspections')
    .insert({ work_order_id: id })
    .select()
    .single();

  if (error || !inspection) {
    return NextResponse.json({ error: error?.message || 'Failed to create inspection' }, { status: 500 });
  }

  // Seed default items
  let sortOrder = 0;
  const items: { inspection_id: string; category: string; item: string; status: string; sort_order: number }[] = [];

  for (const [category, categoryItems] of Object.entries(INSPECTION_CATEGORIES)) {
    for (const item of categoryItems) {
      items.push({
        inspection_id: inspection.id,
        category,
        item,
        status: 'not_checked',
        sort_order: sortOrder++,
      });
    }
  }

  const { error: itemsError } = await supabase.from('inspection_items').insert(items);
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // Re-fetch with items + media
  const { data: full } = await supabase
    .from('inspections')
    .select(INSPECTION_SELECT)
    .eq('id', inspection.id)
    .single();

  return NextResponse.json(formatInspection(full));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  // body: { items: [{ id, status, notes }] }
  if (body.items && Array.isArray(body.items)) {
    for (const item of body.items) {
      const updates: Record<string, unknown> = {};
      if ('status' in item) updates.status = item.status;
      if ('notes' in item) updates.notes = item.notes;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('inspection_items')
          .update(updates)
          .eq('id', item.id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }
  }

  // Return updated inspection with media
  const { data: inspection } = await supabase
    .from('inspections')
    .select(INSPECTION_SELECT)
    .eq('work_order_id', id)
    .single();

  if (!inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // Auto-send DVI report when all items are completed (best-effort, fire-and-forget)
  const allItems = inspection.inspection_items || [];
  const allCompleted = allItems.length > 0 && allItems.every(
    (item: { status: string }) => item.status !== 'not_checked'
  );
  const hasActionable = allItems.some(
    (item: { status: string }) => item.status === 'fail' || item.status === 'attention'
  );

  if (allCompleted && hasActionable && !inspection.dvi_report_sent) {
    (async () => {
      try {
        const { data: shop } = await supabase
          .from('shops')
          .select('dvi_auto_send')
          .single();

        if (shop?.dvi_auto_send) {
          // Call the share endpoint internally
          const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/[^/]*$/, '') || '';
          await fetch(`${origin}/api/work-orders/${id}/inspection/share`, {
            method: 'POST',
            headers: { cookie: req.headers.get('cookie') || '' },
          });

          // Mark as sent so we don't re-send
          await supabase
            .from('inspections')
            .update({ dvi_report_sent: true })
            .eq('id', inspection.id);
        }
      } catch {
        // Auto-send is best-effort
      }
    })();
  }

  return NextResponse.json(formatInspection(inspection));
}
