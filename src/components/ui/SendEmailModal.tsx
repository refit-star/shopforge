'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { Icon, icons } from '@/components/ui/Icon';
import { fmt } from '@/lib/utils';
import type { ShopSettings, LaborLine, PartsLine, Customer, Vehicle } from '@/lib/types';

interface SendEmailModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (email: string) => Promise<void>;
  docType: 'Estimate' | 'Invoice';
  docNumber: string;
  customer: Customer | undefined;
  vehicle: Vehicle | undefined;
  laborLines: LaborLine[];
  partsLines: PartsLine[];
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  tax?: number;
  showTax?: boolean;
  settings: ShopSettings | null;
  paymentLink?: string | null;
}

export function SendEmailModal({
  open, onClose, onSend,
  docType, docNumber, customer, vehicle,
  laborLines, partsLines, laborTotal, partsTotal, grandTotal,
  tax, showTax, settings, paymentLink,
}: SendEmailModalProps) {
  const [email, setEmail] = useState(customer?.email || '');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const shopName = settings?.shop_name || 'ShopForge';
  const vehicleStr = vehicle ? `${vehicle.year || ''} ${vehicle.make} ${vehicle.model}`.trim() : '';

  const handleSend = async () => {
    if (!email.trim()) return;
    setSending(true);
    try {
      await onSend(email.trim());
    } finally {
      setSending(false);
    }
  };

  // Reset email when modal opens with new customer
  const displayEmail = email || customer?.email || '';

  return (
    <Modal open={open} onClose={onClose} title={`Send ${docType}`} wide>
      <div className="space-y-4">
        {/* Recipient */}
        <div>
          <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Recipient Email
          </label>
          <input
            type="email"
            value={displayEmail}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
            placeholder="customer@email.com"
          />
          {!displayEmail && (
            <p className="text-xs text-error mt-1">No email on file for this customer. Enter one above.</p>
          )}
        </div>

        {/* Summary */}
        <div className="bg-bg border border-bdr rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider">{docType}</div>
              <div className="text-sm text-accent font-semibold">{docNumber}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider">Total</div>
              <div className="text-lg text-white font-bold">{fmt(grandTotal)}</div>
            </div>
          </div>

          <div className="border-t border-bdr/50 pt-2">
            <div className="text-xs text-slate-500 mb-1">
              <span className="font-semibold text-slate-400">To:</span> {customer?.name || 'Unknown'}
            </div>
            {vehicleStr && (
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-400">Vehicle:</span> {vehicleStr}
              </div>
            )}
          </div>

          {/* Line items preview */}
          {laborLines.length > 0 && (
            <div className="border-t border-bdr/50 pt-2">
              <div className="text-[10px] text-slate-600 uppercase font-heading font-semibold mb-1">Labor</div>
              {laborLines.map((l, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-400">
                  <span className="truncate mr-2">{l.description}</span>
                  <span className="whitespace-nowrap">{fmt(l.hours * l.rate)}</span>
                </div>
              ))}
            </div>
          )}
          {partsLines.length > 0 && (
            <div className="border-t border-bdr/50 pt-2">
              <div className="text-[10px] text-slate-600 uppercase font-heading font-semibold mb-1">Parts</div>
              {partsLines.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-400">
                  <span className="truncate mr-2">{p.name}</span>
                  <span className="whitespace-nowrap">{fmt(p.qty * p.price)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="border-t border-bdr/50 pt-2 space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Labor</span>
              <span className="text-slate-300">{fmt(laborTotal)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Parts</span>
              <span className="text-slate-300">{fmt(partsTotal)}</span>
            </div>
            {showTax && tax !== undefined && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Tax</span>
                <span className="text-slate-300">{fmt(tax)}</span>
              </div>
            )}
            <div className="border-t border-bdr/50 pt-1">
              <div className="flex justify-between text-sm font-bold">
                <span className="text-white">{showTax ? 'Total' : 'Estimated Total'}</span>
                <span className="text-accent">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Email Preview Toggle */}
        <button
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs text-accent hover:text-orange-400 font-heading font-bold uppercase tracking-wider flex items-center gap-1"
        >
          <Icon d={showPreview ? icons.chevDown : icons.chevRight} size={12} />
          Preview Email HTML
        </button>

        {showPreview && (
          <div className="bg-white rounded-lg overflow-hidden border border-bdr max-h-[300px] overflow-y-auto">
            <div
              className="p-4"
              dangerouslySetInnerHTML={{
                __html: generateEmailHTML({
                  docType, docNumber, customer, vehicleStr,
                  laborLines, partsLines, laborTotal, partsTotal, grandTotal,
                  tax, showTax, shopName,
                  shopPhone: settings?.phone || '',
                  shopEmail: settings?.email || '',
                  shopAddress: settings?.address || '',
                  logoUrl: settings?.logo_url,
                  footer: settings?.invoice_footer || 'Thank you for your business!',
                  paymentLink,
                }),
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSend} disabled={sending || !displayEmail.trim()}>
            <span className="flex items-center gap-2">
              <Icon d={icons.send} size={16} />
              {sending ? 'Sending...' : `Send ${docType}`}
            </span>
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ── HTML entity escaping to prevent XSS ── */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Generate the professional HTML email body ── */
export function generateEmailHTML(opts: {
  docType: string;
  docNumber: string;
  customer: Customer | undefined;
  vehicleStr: string;
  laborLines: LaborLine[];
  partsLines: PartsLine[];
  laborTotal: number;
  partsTotal: number;
  grandTotal: number;
  tax?: number;
  showTax?: boolean;
  shopName: string;
  shopPhone: string;
  shopEmail: string;
  shopAddress: string;
  logoUrl?: string | null;
  footer: string;
  paymentLink?: string | null;
}): string {
  const {
    docType, docNumber, customer, vehicleStr,
    laborLines, partsLines, laborTotal, partsTotal, grandTotal,
    tax, showTax, shopName, shopPhone, shopEmail, shopAddress,
    logoUrl, footer, paymentLink,
  } = opts;

  const laborRows = laborLines.map(l =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333">${escapeHtml(l.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;text-align:right">${l.hours}h x $${l.rate.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333;text-align:right;font-weight:600">$${(l.hours * l.rate).toFixed(2)}</td>
    </tr>`
  ).join('');

  const partsRows = partsLines.map(p =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333">${escapeHtml(p.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666;text-align:right">${p.qty} x $${p.price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#333;text-align:right;font-weight:600">$${(p.qty * p.price).toFixed(2)}</td>
    </tr>`
  ).join('');

  const ctaButton = paymentLink
    ? `<div style="text-align:center;margin:24px 0">
        <a href="${escapeHtml(paymentLink)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.5px">Pay Now &rarr;</a>
      </div>`
    : docType === 'Estimate'
      ? `<div style="text-align:center;margin:24px 0;padding:16px;background:#fef3c7;border-radius:8px">
          <p style="margin:0;font-size:13px;color:#92400e">Please reply to this email or call us to approve or discuss this estimate.</p>
        </div>`
      : '';

  return `<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#333">
  <!-- Header -->
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <table style="width:100%"><tr>
      <td>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(shopName)}" style="max-height:40px;max-width:150px" />` : `<span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:1px">${escapeHtml(shopName)}</span>`}</td>
      <td style="text-align:right;color:#94a3b8;font-size:12px">${escapeHtml(shopAddress)}<br/>${escapeHtml(shopPhone)}${shopEmail ? ' &middot; ' + escapeHtml(shopEmail) : ''}</td>
    </tr></table>
  </div>

  <!-- Body -->
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
    <!-- Doc badge -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
      <div>
        <span style="display:inline-block;background:#f97316;color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:4px">${docType}</span>
        <span style="font-size:16px;font-weight:700;color:#1e293b;margin-left:8px">${docNumber}</span>
      </div>
      <div style="font-size:22px;font-weight:700;color:#f97316">$${grandTotal.toFixed(2)}</div>
    </div>

    <!-- Greeting -->
    <p style="font-size:15px;color:#334155;margin:0 0 20px">
      Hi ${escapeHtml(customer?.name || 'Valued Customer')},
    </p>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px">
      ${docType === 'Estimate'
        ? `Please find your estimate below for the requested service${vehicleStr ? ' on your <strong>' + escapeHtml(vehicleStr) + '</strong>' : ''}. Review the details and let us know if you&rsquo;d like to proceed.`
        : `Here is your invoice${vehicleStr ? ' for service on your <strong>' + escapeHtml(vehicleStr) + '</strong>' : ''}. Please review the details below.`
      }
    </p>

    <!-- Labor -->
    ${laborLines.length > 0 ? `
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 8px;font-weight:700">Labor</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${laborRows}
    </table>` : ''}

    <!-- Parts -->
    ${partsLines.length > 0 ? `
    <h3 style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin:0 0 8px;font-weight:700">Parts</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      ${partsRows}
    </table>` : ''}

    <!-- Totals -->
    <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-top:8px">
      <table style="width:100%">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b">Labor Subtotal</td>
          <td style="padding:4px 0;font-size:13px;color:#334155;text-align:right">$${laborTotal.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b">Parts Subtotal</td>
          <td style="padding:4px 0;font-size:13px;color:#334155;text-align:right">$${partsTotal.toFixed(2)}</td>
        </tr>
        ${showTax && tax !== undefined ? `
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#64748b">Tax</td>
          <td style="padding:4px 0;font-size:13px;color:#334155;text-align:right">$${tax.toFixed(2)}</td>
        </tr>` : ''}
        <tr>
          <td colspan="2" style="padding:0"><div style="border-top:2px solid #e2e8f0;margin:8px 0"></div></td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:18px;font-weight:700;color:#1e293b">${showTax ? 'Total Due' : 'Estimated Total'}</td>
          <td style="padding:4px 0;font-size:18px;font-weight:700;color:#f97316;text-align:right">$${grandTotal.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    ${ctaButton}
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:20px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;text-align:center">
    <p style="margin:0;font-size:12px;color:#94a3b8">${escapeHtml(footer)}</p>
    <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1">${escapeHtml(shopName)} &middot; ${escapeHtml(shopAddress)}</p>
  </div>
</div>`;
}
