import { createServerClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';
import { csvCell } from '@/lib/csv';

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('customers')
      .select('name, phone, email, address, city, state, zip, tags, created_at')
      .order('name')
      .range(0, 49999);

    if (error) return internalError(error, 'export customers');

    const header = 'Name,Phone,Email,Address,City,State,Zip,Tags,Created At';
    const rows = (data || []).map(r =>
      [
        csvCell(r.name),
        csvCell(r.phone),
        csvCell(r.email),
        csvCell(r.address),
        csvCell(r.city),
        csvCell(r.state),
        csvCell(r.zip),
        csvCell(Array.isArray(r.tags) ? r.tags.join('; ') : ''),
        csvCell(r.created_at),
      ].join(',')
    );

    const csv = [header, ...rows].join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="customers.csv"',
      },
    });
  } catch (err) {
    return internalError(err, 'export customers');
  }
}
