import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';
import { csvCell } from '@/lib/csv';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('vehicles')
      .select('year, make, model, vin, plate, mileage, customers(name)')
      .order('make')
      .range(0, 49999);

    if (error) return internalError(error, 'export vehicles');

    const header = 'Customer Name,Year,Make,Model,VIN,Plate,Mileage';
    const rows = (data || []).map(r => {
      const customer = r.customers as unknown as { name: string } | null;
      return [
        csvCell(customer?.name),
        csvCell(r.year),
        csvCell(r.make),
        csvCell(r.model),
        csvCell(r.vin),
        csvCell(r.plate),
        csvCell(r.mileage),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vehicles.csv"',
      },
    });
  } catch (err) {
    return internalError(err, 'export vehicles');
  }
}
