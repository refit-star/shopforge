export const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtK = (n: number) =>
  n >= 1000 ? '$' + (Math.round(n / 100) / 10) + 'K' : fmt(n);

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

export function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

interface PrintDocOpts {
  title: string;
  docNumber: string;
  docDate: string;
  docLabel?: string;
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopEmail: string;
  customerName: string;
  vehicleStr: string;
  laborLines: { description: string; hours: number; rate: number }[];
  partsLines: { name: string; qty: number; price: number }[];
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  notes?: string | null;
  footer?: string;
  showTax?: boolean;
  tax?: number;
  extraInfo?: string;
  logoUrl?: string | null;
}

export function printDocument(opts: PrintDocOpts) {
  const w = window.open('', '_blank');
  if (!w) return;
  const label = opts.docLabel || 'Document';
  w.document.write(`<!DOCTYPE html><html><head><title>${opts.title}</title><style>
    body{font-family:Arial,sans-serif;margin:40px;color:#222}
    h1{font-size:24px;margin:0}h2{font-size:14px;margin:0;color:#666}
    .header{display:flex;justify-content:space-between;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px}
    table{width:100%;border-collapse:collapse;margin:15px 0}
    th{text-align:left;border-bottom:2px solid #ddd;padding:8px 4px;font-size:12px;text-transform:uppercase;color:#666}
    td{padding:8px 4px;border-bottom:1px solid #eee;font-size:13px}
    .right{text-align:right}
    .totals{margin-top:20px;border-top:2px solid #333;padding-top:15px}
    .total-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
    .grand{font-size:20px;font-weight:bold;border-top:2px solid #333;padding-top:10px;margin-top:10px}
    .notes{margin-top:20px;padding:12px;background:#f9f9f9;border:1px solid #ddd;border-radius:4px;font-size:12px;color:#555}
    .notes strong{color:#333}
    .footer{margin-top:40px;padding-top:15px;border-top:1px solid #ddd;font-size:11px;color:#888;text-align:center}
    @media print{body{margin:20px}}
  </style></head><body>
  <div class="header">
    <div>${opts.logoUrl ? '<img src="' + opts.logoUrl + '" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain;margin-bottom:8px" />' : ''}<h1>${opts.shopName}</h1><h2>${opts.shopAddress}</h2><h2>${opts.shopPhone}${opts.shopEmail ? ' · ' + opts.shopEmail : ''}</h2></div>
    <div style="text-align:right"><h1>${opts.docNumber}</h1><h2>${label}</h2><h2>${opts.docDate}</h2>${opts.extraInfo ? '<h2>' + opts.extraInfo + '</h2>' : ''}</div>
  </div>
  <div style="margin-bottom:20px"><strong>Customer:</strong> ${opts.customerName}<br/><span style="color:#666">${opts.vehicleStr}</span></div>
  ${opts.laborLines.length ? '<table><thead><tr><th>Labor Description</th><th class="right">Hours</th><th class="right">Rate</th><th class="right">Total</th></tr></thead><tbody>' + opts.laborLines.map(l => '<tr><td>' + l.description + '</td><td class="right">' + l.hours + '</td><td class="right">$' + l.rate.toFixed(2) + '</td><td class="right">$' + (l.hours * l.rate).toFixed(2) + '</td></tr>').join('') + '</tbody></table>' : ''}
  ${opts.partsLines.length ? '<table><thead><tr><th>Part</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead><tbody>' + opts.partsLines.map(p => '<tr><td>' + p.name + '</td><td class="right">' + p.qty + '</td><td class="right">$' + p.price.toFixed(2) + '</td><td class="right">$' + (p.qty * p.price).toFixed(2) + '</td></tr>').join('') + '</tbody></table>' : ''}
  <div class="totals">
    <div class="total-row"><span>Labor Subtotal</span><span>$${opts.laborTotal.toFixed(2)}</span></div>
    <div class="total-row"><span>Parts Subtotal</span><span>$${opts.partsTotal.toFixed(2)}</span></div>
    ${opts.showTax ? '<div class="total-row"><span>Tax</span><span>$' + (opts.tax || 0).toFixed(2) + '</span></div>' : ''}
    <div class="total-row grand"><span>${opts.showTax ? 'Total' : 'Estimated Total'}</span><span>$${opts.grandTotal.toFixed(2)}</span></div>
  </div>
  ${opts.notes ? '<div class="notes"><strong>Notes:</strong> ' + opts.notes + '</div>' : ''}
  <div class="footer">${opts.footer || 'Thank you for your business!'}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
