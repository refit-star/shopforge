import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { jsPDF } from 'jspdf';
import { rateLimit } from '@/lib/rate-limit';

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Rate limit: max 10 PDF generations per token per hour
  if (!rateLimit(`pdf:${token}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 });
  }

  const supabase = createAdminClient();

  // Fetch estimate with relations
  const { data: estimate } = await supabase
    .from('estimates')
    .select(`
      *,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, plate),
      estimate_labor_lines(id, description, hours, rate, sort_order),
      estimate_parts_lines(id, name, qty, price, sort_order)
    `)
    .eq('portal_token', token)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 });
  }

  // Fetch shop info
  const { data: shop } = await supabase
    .from('shops')
    .select('name, address, phone, email, logo_url')
    .eq('id', estimate.shop_id)
    .single();

  // Fetch signature if approved
  let signature = null;
  if (estimate.status === 'Approved') {
    const { data: sig } = await supabase
      .from('estimate_signatures')
      .select('signer_name, signature_url, approved_at')
      .eq('estimate_id', estimate.id)
      .single();
    signature = sig || null;
  }

  // Compute totals
  const laborLines = (estimate.estimate_labor_lines || []) as { description: string; hours: number; rate: number }[];
  const partsLines = (estimate.estimate_parts_lines || []) as { name: string; qty: number; price: number }[];
  const laborTotal = laborLines.reduce((s, l) => s + Number(l.hours) * Number(l.rate), 0);
  const partsTotal = partsLines.reduce((s, p) => s + Number(p.qty) * Number(p.price), 0);
  const grandTotal = laborTotal + partsTotal;

  const customer = estimate.customer as { name: string; phone?: string; email?: string } | null;
  const vehicle = estimate.vehicle as { year?: number; make: string; model: string; vin?: string; plate?: string } | null;
  const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : '';

  // Generate PDF
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 50;
  let y = 50;

  // Shop header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(shop?.name || 'ShopForge', margin, y);
  y += 18;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  if (shop?.address) { doc.text(shop.address, margin, y); y += 12; }
  const contactParts = [shop?.phone, shop?.email].filter(Boolean).join(' | ');
  if (contactParts) { doc.text(contactParts, margin, y); y += 12; }

  // Estimate title
  y += 10;
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Estimate ${estimate.display_id}`, margin, y);

  // Status badge
  const statusText = estimate.status as string;
  doc.setFontSize(10);
  const statusW = doc.getTextWidth(statusText) + 16;
  doc.setFillColor(estimate.status === 'Approved' ? 34 : 59, estimate.status === 'Approved' ? 197 : 130, estimate.status === 'Approved' ? 94 : 246);
  doc.roundedRect(pageW - margin - statusW, y - 12, statusW, 16, 3, 3, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.text(statusText, pageW - margin - statusW + 8, y);
  doc.setTextColor(0);
  y += 10;

  // Date
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Created: ${new Date(estimate.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
  y += 20;

  // Customer & Vehicle
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer', margin, y);
  doc.text('Vehicle', pageW / 2, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.text(customer?.name || '--', margin, y);
  doc.text(vehicleStr || '--', pageW / 2, y);
  y += 12;
  if (customer?.phone) { doc.setTextColor(100); doc.text(customer.phone, margin, y); doc.setTextColor(0); }
  if (vehicle?.vin) { doc.setTextColor(100); doc.text(`VIN: ${vehicle.vin}`, pageW / 2, y); doc.setTextColor(0); }
  y += 20;

  // Service
  doc.setFont('helvetica', 'bold');
  doc.text('Service', margin, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.text(estimate.job || '', margin, y, { maxWidth: pageW - margin * 2 });
  y += 20;

  // Divider helper
  const drawLine = () => {
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
  };

  // Labor table
  if (laborLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Labor', margin, y);
    y += 15;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Description', margin, y);
    doc.text('Hours', 340, y, { align: 'right' });
    doc.text('Rate', 420, y, { align: 'right' });
    doc.text('Amount', pageW - margin, y, { align: 'right' });
    y += 4;
    drawLine();
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    for (const l of laborLines) {
      doc.text(l.description, margin, y);
      doc.text(String(l.hours), 340, y, { align: 'right' });
      doc.text(fmt(Number(l.rate)), 420, y, { align: 'right' });
      doc.text(fmt(Number(l.hours) * Number(l.rate)), pageW - margin, y, { align: 'right' });
      y += 14;
    }
    y += 6;
  }

  // Parts table
  if (partsLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Parts', margin, y);
    y += 15;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Part', margin, y);
    doc.text('Qty', 340, y, { align: 'right' });
    doc.text('Price', 420, y, { align: 'right' });
    doc.text('Amount', pageW - margin, y, { align: 'right' });
    y += 4;
    drawLine();
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    for (const p of partsLines) {
      doc.text(p.name, margin, y);
      doc.text(String(p.qty), 340, y, { align: 'right' });
      doc.text(fmt(Number(p.price)), 420, y, { align: 'right' });
      doc.text(fmt(Number(p.qty) * Number(p.price)), pageW - margin, y, { align: 'right' });
      y += 14;
    }
    y += 6;
  }

  // Totals
  drawLine();
  doc.setFontSize(9);
  doc.text('Labor Subtotal', 350, y, { align: 'right' });
  doc.text(fmt(laborTotal), pageW - margin, y, { align: 'right' });
  y += 14;
  doc.text('Parts Subtotal', 350, y, { align: 'right' });
  doc.text(fmt(partsTotal), pageW - margin, y, { align: 'right' });
  y += 6;
  drawLine();
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Estimated Total', 350, y + 4, { align: 'right' });
  doc.text(fmt(grandTotal), pageW - margin, y + 4, { align: 'right' });
  y += 30;

  // Signature section
  if (signature) {
    y += 10;
    drawLine();
    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Authorization', margin, y);
    y += 14;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(
      'By signing below, the customer authorizes the shop to proceed with the services described in this estimate.',
      margin, y, { maxWidth: pageW - margin * 2 }
    );
    y += 24;

    // Try to embed signature image
    try {
      const sigRes = await fetch(signature.signature_url);
      if (sigRes.ok) {
        const sigBuffer = await sigRes.arrayBuffer();
        const sigBase64 = Buffer.from(sigBuffer).toString('base64');
        const sigDataUrl = `data:image/png;base64,${sigBase64}`;
        doc.addImage(sigDataUrl, 'PNG', margin, y, 200, 80);
        y += 85;
      }
    } catch {
      // Skip image if fetch fails
    }

    // Signature line
    doc.setDrawColor(0);
    doc.line(margin, y, margin + 250, y);
    y += 14;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(signature.signer_name, margin, y);
    y += 12;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(
      `Signed on ${new Date(signature.approved_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      margin, y
    );
  }

  // Generate PDF buffer
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Estimate-${estimate.display_id}.pdf"`,
    },
  });
}
