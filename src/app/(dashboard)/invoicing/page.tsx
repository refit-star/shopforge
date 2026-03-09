'use client';

import { useState, useEffect, useMemo } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Btn } from '@/components/ui/Btn';
import { Icon, icons } from '@/components/ui/Icon';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import type { Invoice, InvoiceStatus } from '@/lib/types';

const STATUS_ORDER: Record<InvoiceStatus, number> = {
  Overdue: 0,
  Sent: 1,
  Draft: 2,
  Paid: 3,
};

const SUMMARY_CARDS: { label: InvoiceStatus; color: string }[] = [
  { label: 'Draft', color: '#64748b' },
  { label: 'Sent', color: '#3b82f6' },
  { label: 'Paid', color: '#22c55e' },
  { label: 'Overdue', color: '#ef4444' },
];

interface InvoiceDetail extends Invoice {
  labor_lines: { description: string; hours: number; rate: number }[];
  parts_lines: { name: string; qty: number; price: number }[];
}

export default function InvoicingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInv, setSelectedInv] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payMethod, setPayMethod] = useState('Card');
  const [markingPaid, setMarkingPaid] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  // Fetch all invoices
  useEffect(() => {
    fetch('/api/invoices')
      .then(r => r.json())
      .then(data => { setInvoices(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Sorted invoices
  const sorted = useMemo(() => {
    return [...invoices].sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
    );
  }, [invoices]);

  // Summary totals
  const totals = useMemo(() => {
    return invoices.reduce<Record<string, number>>((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + inv.total;
      return acc;
    }, {});
  }, [invoices]);

  // Open invoice detail
  const openInvoice = async (inv: Invoice) => {
    setDetailLoading(true);
    setSelectedInv(null);
    setLinkCopied(false);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`);
      const detail: InvoiceDetail = await res.json();
      setSelectedInv(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  // Mark as paid
  const markPaid = async () => {
    if (!selectedInv) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Paid', payment_method: payMethod }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedInv(prev => prev ? { ...prev, status: 'Paid', payment_method: payMethod, ...updated } : null);
        setInvoices(prev =>
          prev.map(inv => inv.id === selectedInv.id ? { ...inv, status: 'Paid' as InvoiceStatus, payment_method: payMethod } : inv)
        );
      }
    } finally {
      setMarkingPaid(false);
    }
  };

  // Send payment link
  const sendPaymentLink = async () => {
    if (!selectedInv) return;
    setSendingLink(true);
    setLinkCopied(false);
    try {
      const res = await fetch(`/api/invoices/${selectedInv.id}/payment-link`, {
        method: 'POST',
      });
      if (res.ok) {
        const { url } = await res.json();
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 3000);
      }
    } finally {
      setSendingLink(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-bdr rounded-xl p-4 h-20 animate-pulse" />
          ))}
        </div>
        <div className="bg-card border border-bdr rounded-xl h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {SUMMARY_CARDS.map(s => (
          <div key={s.label} className="bg-card border border-bdr rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">
                {s.label}
              </span>
            </div>
            <div className="text-2xl font-heading font-bold text-white">
              {fmt(totals[s.label] || 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Invoice table */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <TH>Invoice #</TH>
              <TH>Customer</TH>
              <TH>Vehicle</TH>
              <TH>Date</TH>
              <TH className="text-right">Labor</TH>
              <TH className="text-right">Parts</TH>
              <TH className="text-right">Total</TH>
              <TH>Status</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-bdr">
            {sorted.map(inv => {
              const vehicle = inv.vehicle
                ? `${inv.vehicle.year || ''} ${inv.vehicle.make} ${inv.vehicle.model}`.trim()
                : '';
              return (
                <tr
                  key={inv.id}
                  className="hover:bg-surface/30 transition cursor-pointer"
                  onClick={() => openInvoice(inv)}
                >
                  <TD>
                    <span className="text-accent font-semibold">{inv.display_id}</span>
                  </TD>
                  <TD className="text-slate-200">{inv.customer?.name}</TD>
                  <TD className="text-slate-400 text-xs">{vehicle}</TD>
                  <TD className="text-slate-400">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </TD>
                  <TD className="text-right text-slate-300">{fmt(inv.labor_total)}</TD>
                  <TD className="text-right text-slate-300">{fmt(inv.parts_total)}</TD>
                  <TD className="text-right text-white font-semibold">{fmt(inv.total)}</TD>
                  <TD>
                    <StatusBadge status={inv.status} />
                  </TD>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <TD colSpan={8} className="text-center text-slate-500 py-12">
                  No invoices found.
                </TD>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Detail Slide-Over */}
      <SlideOver
        open={!!selectedInv || detailLoading}
        onClose={() => { setSelectedInv(null); setDetailLoading(false); setLinkCopied(false); }}
        title={selectedInv ? selectedInv.display_id : 'Loading...'}
      >
        {detailLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bg rounded-lg p-3 border border-bdr h-20 animate-pulse" />
              <div className="bg-bg rounded-lg p-3 border border-bdr h-20 animate-pulse" />
              <div className="bg-bg rounded-lg p-3 border border-bdr h-20 animate-pulse" />
              <div className="bg-bg rounded-lg p-3 border border-bdr h-20 animate-pulse" />
            </div>
            <div className="bg-bg rounded-lg p-4 border border-bdr h-48 animate-pulse" />
          </div>
        )}
        {selectedInv && (() => {
          const inv = selectedInv;
          const vehicle = inv.vehicle
            ? `${inv.vehicle.year || ''} ${inv.vehicle.make} ${inv.vehicle.model}`.trim()
            : '';

          return (
            <div className="space-y-6">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bg rounded-lg p-3 border border-bdr">
                  <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                    Customer
                  </div>
                  <div className="text-sm text-white font-medium">{inv.customer?.name}</div>
                </div>
                <div className="bg-bg rounded-lg p-3 border border-bdr">
                  <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                    Vehicle
                  </div>
                  <div className="text-sm text-white font-medium">{vehicle}</div>
                </div>
                <div className="bg-bg rounded-lg p-3 border border-bdr">
                  <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                    Date
                  </div>
                  <div className="text-sm text-white">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-bg rounded-lg p-3 border border-bdr">
                  <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                    Status
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>

              {/* Labor lines */}
              {inv.labor_lines && inv.labor_lines.length > 0 && (
                <div>
                  <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">
                    Labor
                  </h4>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bdr">
                        <TH>Description</TH>
                        <TH className="text-right">Hours</TH>
                        <TH className="text-right">Rate</TH>
                        <TH className="text-right">Total</TH>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bdr/50">
                      {inv.labor_lines.map((l, i) => (
                        <tr key={i}>
                          <TD className="text-slate-300">{l.description}</TD>
                          <TD className="text-right text-slate-400">{l.hours}</TD>
                          <TD className="text-right text-slate-400">{fmt(l.rate)}</TD>
                          <TD className="text-right text-white font-medium">
                            {fmt(l.hours * l.rate)}
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Parts lines */}
              {inv.parts_lines && inv.parts_lines.length > 0 && (
                <div>
                  <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">
                    Parts
                  </h4>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bdr">
                        <TH>Part</TH>
                        <TH className="text-right">Qty</TH>
                        <TH className="text-right">Price</TH>
                        <TH className="text-right">Total</TH>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bdr/50">
                      {inv.parts_lines.map((p, i) => (
                        <tr key={i}>
                          <TD className="text-slate-300">{p.name}</TD>
                          <TD className="text-right text-slate-400">{p.qty}</TD>
                          <TD className="text-right text-slate-400">{fmt(p.price)}</TD>
                          <TD className="text-right text-white font-medium">
                            {fmt(p.qty * p.price)}
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="bg-bg rounded-lg p-4 border border-bdr">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Labor Subtotal</span>
                  <span className="text-slate-200">{fmt(inv.labor_total)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Parts Subtotal</span>
                  <span className="text-slate-200">{fmt(inv.parts_total)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Tax</span>
                  <span className="text-slate-200">{fmt(inv.tax)}</span>
                </div>
                <div className="border-t border-bdr my-2" />
                <div className="flex justify-between font-bold">
                  <span className="text-white">Grand Total</span>
                  <span className="text-accent text-xl">{fmt(inv.total)}</span>
                </div>
              </div>

              {/* Payment info / Mark as Paid / Send Payment Link */}
              {inv.status === 'Paid' ? (
                <div className="bg-success/10 border border-success/30 rounded-lg p-4 flex items-center gap-3">
                  <Icon d={icons.check} size={20} stroke="#22c55e" />
                  <div>
                    <div className="text-sm text-success font-semibold">Paid</div>
                    <div className="text-xs text-slate-400">
                      Payment method: {inv.payment_method || '--'}
                    </div>
                    {inv.paid_at && (
                      <div className="text-xs text-slate-500">
                        Paid on {new Date(inv.paid_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Record Payment */}
                  <div>
                    <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-3">
                      Record Payment
                    </h4>
                    <div className="flex items-center gap-3">
                      <select
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value)}
                        className="bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
                      >
                        <option>Card</option>
                        <option>Cash</option>
                        <option>Check</option>
                      </select>
                      <Btn variant="success" onClick={markPaid} disabled={markingPaid}>
                        <span className="flex items-center gap-2">
                          <Icon d={icons.check} size={16} />
                          {markingPaid ? 'Saving...' : 'Mark as Paid'}
                        </span>
                      </Btn>
                    </div>
                  </div>

                  {/* Send Payment Link */}
                  <div>
                    <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-3">
                      Online Payment
                    </h4>
                    <Btn onClick={sendPaymentLink} disabled={sendingLink}>
                      <span className="flex items-center gap-2">
                        <Icon d={icons.dollar} size={16} />
                        {sendingLink
                          ? 'Generating...'
                          : linkCopied
                            ? 'Link Copied!'
                            : 'Send Payment Link'}
                      </span>
                    </Btn>
                    {linkCopied && (
                      <p className="text-xs text-success mt-2">
                        Payment link copied to clipboard.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>
    </div>
  );
}
