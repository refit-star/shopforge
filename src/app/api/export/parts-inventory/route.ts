import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';
import { csvCell } from '@/lib/csv';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('parts_inventory')
      .select('name, part_number, category, qty_on_hand, cost, price, active, vendors(name)')
      .order('name')
      .range(0, 49999);

    if (error) return internalError(error, 'export parts inventory');

    const header = 'Name,Part Number,Category,Qty On Hand,Cost,Price,Vendor,Active';
    const rows = (data || []).map(r => {
      const vendor = r.vendors as unknown as { name: string } | null;
      return [
        csvCell(r.name),
        csvCell(r.part_number),
        csvCell(r.category),
        csvCell(r.qty_on_hand),
        csvCell(r.cost),
        csvCell(r.price),
        csvCell(vendor?.name),
        csvCell(r.active ? 'Yes' : 'No'),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="parts-inventory.csv"',
      },
    });
  } catch (err) {
    return internalError(err, 'export parts inventory');
  }
}
