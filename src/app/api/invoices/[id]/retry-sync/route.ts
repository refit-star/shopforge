import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { syncInvoiceToQB } from '@/lib/quickbooks';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Get the invoice to find shop_id
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, shop_id, qb_sync_error')
    .eq('id', id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (!invoice.shop_id) {
    return NextResponse.json({ error: 'No shop_id on invoice' }, { status: 400 });
  }

  // Clear the existing error
  await supabase
    .from('invoices')
    .update({ qb_sync_error: null })
    .eq('id', id);

  // Retry sync
  try {
    await syncInvoiceToQB(id, invoice.shop_id);

    // Check if it succeeded (the function stores errors in qb_sync_error)
    const { data: updated } = await supabase
      .from('invoices')
      .select('qb_sync_error, qb_invoice_id')
      .eq('id', id)
      .single();

    if (updated?.qb_sync_error) {
      return NextResponse.json({ error: updated.qb_sync_error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, qb_invoice_id: updated?.qb_invoice_id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
