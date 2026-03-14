'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Btn } from '@/components/ui/Btn';
import { Icon, icons } from '@/components/ui/Icon';
import { TH, TD } from '@/components/ui/Table';
import { SendEmailModal, generateEmailHTML } from '@/components/ui/SendEmailModal';
import { fmt, printDocument } from '@/lib/utils';
import type { Invoice, InvoiceStatus, ShopSettings } from '@/lib/types';

const STATUS_ORDER: Record<InvoiceStatus, number> = {
  Overdue: 0,
  Sent: 1,
  Draft: 2,
  Paid: 3,
  Void: 4,
};

const SUMMARY_CARDS: { label: InvoiceStatus; color: string }[] = [
  { label: 'Draft', color: '#64748b' },
  { label: 'Sent', color: '#3b82f6' },
  { label: 'Paid', color: '#22c55e' },
  { label: 'Overdue', color: '#ef4444' },
  { label: 'Void', color: '#64748b' },
];

interface InvoiceDetail extends Invoice {
  labor_lines: { description: string; hours: number; rate: number }[];
  parts_lines: { name: string; qty: number; price: number }[];
}

export default function InvoicingPage() {
  return <Suspense fallback={null}><InvoicingContent /></Suspense>;
}

function InvoicingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInv, setSelectedInv] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payMethod, setPayMethod] = useState('Card');
  const [markingPaid, setMarkingPaid] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [textingLink, setTextingLink] = useState(false);
  const [textSent, setTextSent] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/invoices').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([json, settings]) => {
      const invs = Array.isArray(json) ? json : json.data ?? [];
      setInvoices(invs);
      setShopSettings(settings);
      setLoading(false);

      const openParam = searchParams.get('open');
      if (openParam) {
        const match = invs.find((inv: Invoice) => inv.id === openParam);
        if (match) openInvoice(match);
      }
    }).catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const voidInvoice = async () => {
    if (!selectedInv) return;
    setVoiding(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Void' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedInv(prev => prev ? { ...prev, ...updated, status: 'Void' as InvoiceStatus } : null);
        setInvoices(prev =>
          prev.map(inv => inv.id === selectedInv.id ? { ...inv, status: 'Void' as InvoiceStatus } : inv)
        );
      }
    } finally {
      setVoiding(false);
    }
  };

  const bulkMarkStatus = async (status: InvoiceStatus) => {
    const ids = Array.from(bulkSelected);
    await Promise.all(ids.map(id =>
      fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(status === 'Paid' ? { payment_method: 'Bulk' } : {}) }),
      })
    ));
    setBulkSelected(new Set());
    setShowBulkMenu(false);
    const json = await fetch('/api/invoices').then(r => r.json());
    setInvoices(Array.isArray(json) ? json : json.data ?? []);
  };

  const sendInvoiceEmail = async (recipientEmail: string) => {
    if (!selectedInv) return;
    const shopName = shopSettings?.shop_name || 'ShopForge';
    const vehicle = selectedInv.vehicle
      ? `${selectedInv.vehicle.year || ''} ${selectedInv.vehicle.make} ${selectedInv.vehicle.model}`.trim()
      : '';
    const emailBody = generateEmailHTML({
      docType: 'Invoice',
      docNumber: selectedInv.display_id,
      customer: selectedInv.customer,
      vehicleStr: vehicle,
      laborLines: selectedInv.labor_lines || [],
      partsLines: selectedInv.parts_lines || [],
      laborTotal: selectedInv.labor_total,
      partsTotal: selectedInv.parts_total,
      grandTotal: selectedInv.total,
      tax: selectedInv.tax,
      showTax: true,
      shopName,
      shopPhone: shopSettings?.phone || '',
      shopEmail: shopSettings?.email || '',
      shopAddress: shopSettings?.address || '',
      logoUrl: shopSettings?.logo_url,
      footer: shopSettings?.invoice_footer || 'Thank you for your business!',
      paymentLink: selectedInv.stripe_payment_link,
    });

    // Log as notification in the database
    const notifRes = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selectedInv.customer_id,
        type: 'invoice_sent',
        channel: 'email',
        message: `Invoice ${selectedInv.display_id} (${fmt(selectedInv.total)}) emailed to ${recipientEmail}.`,
      }),
    });
    const notif = await notifRes.json();

    // Send the actual email via Resend
    const sendRes = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `${shopName} - Invoice ${selectedInv.display_id}`,
        html: emailBody,
        notification_id: notif.id,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.json();
      if (err.error?.includes('not configured')) {
        alert(err.error + '\n\nGo to Settings > Integrations to add your Resend API key.');
      } else {
        alert('Email send failed: ' + (err.error || 'Unknown error'));
      }
      return;
    }

    // Update invoice status to Sent (only if currently Draft)
    if (selectedInv.status === 'Draft') {
      const res = await fetch(`/api/invoices/${selectedInv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Sent' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedInv(prev => prev ? { ...prev, ...updated, status: 'Sent' as InvoiceStatus } : null);
        setInvoices(prev =>
          prev.map(inv => inv.id === selectedInv.id ? { ...inv, status: 'Sent' as InvoiceStatus } : inv)
        );
      }
    }

    setShowEmailModal(false);
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 4000);

    // Text-to-pay: send SMS with payment link if enabled
    if (shopSettings?.text_to_pay_enabled && selectedInv.customer?.phone) {
      try {
        const linkRes = await fetch(`/api/invoices/${selectedInv.id}/payment-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ send_sms: true }),
        });
        if (linkRes.ok) {
          const linkData = await linkRes.json();
          if (linkData.sms_sent) {
            setTextSent(true);
            setTimeout(() => setTextSent(false), 4000);
          }
          // Update the selected invoice with the payment link
          if (linkData.url) {
            setSelectedInv(prev => prev ? { ...prev, stripe_payment_link: linkData.url } : null);
          }
        }
      } catch {
        // Best-effort
      }
    }
  };

  const toggleBulkInv = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      {bulkSelected.size > 0 && (
        <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-lg px-4 py-2">
          <span className="text-sm text-accent font-semibold">{bulkSelected.size} selected</span>
          <div className="relative">
            <Btn small onClick={() => setShowBulkMenu(!showBulkMenu)}>
              Change Status
            </Btn>
            {showBulkMenu && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-bdr rounded-lg shadow-xl z-20 py-1 min-w-[150px]">
                {(['Draft', 'Sent', 'Paid', 'Overdue', 'Void'] as InvoiceStatus[]).map(s => (
                  <button key={s} onClick={() => bulkMarkStatus(s)}
                    className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-surface/50 transition">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setBulkSelected(new Set())} className="text-xs text-slate-500 hover:text-white ml-auto">
            Clear
          </button>
        </div>
      )}

      {/* Invoice table */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <TH className="w-8">
                <input type="checkbox"
                  checked={sorted.length > 0 && sorted.every(inv => bulkSelected.has(inv.id))}
                  onChange={() => {
                    if (sorted.every(inv => bulkSelected.has(inv.id))) {
                      setBulkSelected(new Set());
                    } else {
                      setBulkSelected(new Set(sorted.map(inv => inv.id)));
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-slate-600 text-accent focus:ring-accent/50 bg-transparent cursor-pointer" />
              </TH>
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
                    <input type="checkbox" checked={bulkSelected.has(inv.id)} onChange={() => toggleBulkInv(inv.id)}
                      onClick={e => e.stopPropagation()}
                      className="w-3.5 h-3.5 rounded border-slate-600 text-accent focus:ring-accent/50 bg-transparent cursor-pointer" />
                  </TD>
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
                <TD colSpan={9} className="text-center text-slate-500 py-12">
                  No invoices found.
                </TD>
              </tr>
            )}
          </tbody>
        </table>
        </div>
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
                  <Link href={`/customers?open=${inv.customer_id}`} className="text-sm text-accent hover:text-orange-400 font-medium transition">{inv.customer?.name}</Link>
                </div>
                <div className="bg-bg rounded-lg p-3 border border-bdr">
                  <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                    Vehicle
                  </div>
                  <div className="text-sm text-white font-medium">{vehicle}</div>
                </div>
                {inv.work_order_id && (
                  <div className="bg-bg rounded-lg p-3 border border-bdr">
                    <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">
                      Source Work Order
                    </div>
                    <Link href={`/work-orders?open=${inv.work_order_id}`} className="text-sm text-accent hover:text-orange-400 font-mono font-medium transition">
                      View WO &rarr;
                    </Link>
                  </div>
                )}
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

              {/* QB Sync Error */}
              {inv.qb_sync_error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Icon d={icons.alert} size={16} stroke="#ef4444" className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-red-400 mb-0.5">QuickBooks Sync Failed</div>
                      <div className="text-xs text-red-300/70 break-words">{inv.qb_sync_error}</div>
                    </div>
                    <button
                      onClick={async () => {
                        setRetrying(true);
                        try {
                          const res = await fetch(`/api/invoices/${inv.id}/retry-sync`, { method: 'POST' });
                          if (res.ok) {
                            setSelectedInv(prev => prev ? { ...prev, qb_sync_error: null } : null);
                            const json = await fetch('/api/invoices').then(r => r.json());
                            setInvoices(Array.isArray(json) ? json : json.data ?? []);
                          } else {
                            const err = await res.json();
                            alert('Retry failed: ' + (err.error || 'Unknown error'));
                          }
                        } catch {
                          alert('Retry failed');
                        }
                        setRetrying(false);
                      }}
                      disabled={retrying}
                      className="shrink-0 text-[10px] font-heading font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2.5 py-1 hover:bg-red-500/20 transition disabled:opacity-50"
                    >
                      {retrying ? 'Retrying...' : 'Retry Sync'}
                    </button>
                  </div>
                </div>
              )}

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

              {/* Print & Send */}
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={() => {
                  const s = shopSettings;
                  printDocument({
                    title: inv.display_id,
                    docNumber: inv.display_id,
                    docLabel: 'Invoice',
                    docDate: new Date(inv.created_at).toLocaleDateString(),
                    shopName: s?.shop_name || 'ShopForge',
                    shopAddress: s?.address || '',
                    shopPhone: s?.phone || '',
                    shopEmail: s?.email || '',
                    customerName: inv.customer?.name || '',
                    vehicleStr: vehicle,
                    laborLines: inv.labor_lines || [],
                    partsLines: inv.parts_lines || [],
                    laborTotal: inv.labor_total,
                    partsTotal: inv.parts_total,
                    grandTotal: inv.total,
                    showTax: true,
                    tax: inv.tax,
                    footer: s?.invoice_footer || 'Thank you for your business!',
                    extraInfo: `Status: ${inv.status}`,
                    logoUrl: s?.logo_url,
                  });
                }}>
                  <span className="flex items-center gap-2"><Icon d={icons.print} size={16} />Print</span>
                </Btn>
                {(inv.status === 'Draft' || inv.status === 'Sent' || inv.status === 'Overdue') && (
                  <>
                    <Btn onClick={() => setShowEmailModal(true)}>
                      <span className="flex items-center gap-2"><Icon d={icons.send} size={16} />Send Invoice</span>
                    </Btn>
                    {inv.customer?.phone && shopSettings?.text_to_pay_enabled && (
                      <Btn variant="secondary" disabled={textingLink} onClick={async () => {
                        setTextingLink(true);
                        try {
                          const res = await fetch(`/api/invoices/${inv.id}/payment-link`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ send_sms: true }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            if (data.sms_sent) {
                              setTextSent(true);
                              setTimeout(() => setTextSent(false), 4000);
                            }
                            if (data.url) {
                              setSelectedInv(prev => prev ? { ...prev, stripe_payment_link: data.url } : null);
                            }
                          }
                        } finally {
                          setTextingLink(false);
                        }
                      }}>
                        <span className="flex items-center gap-2">
                          <Icon d={icons.message} size={16} />
                          {textingLink ? 'Sending...' : 'Text Payment Link'}
                        </span>
                      </Btn>
                    )}
                  </>
                )}
                {!!(inv as unknown as Record<string, unknown>).portal_token && (
                  <Btn variant="secondary" onClick={() => {
                    const url = `${window.location.origin}/portal/${(inv as unknown as Record<string, unknown>).portal_token}`;
                    navigator.clipboard.writeText(url);
                    setPortalCopied(true);
                    setTimeout(() => setPortalCopied(false), 3000);
                  }}>
                    <span className="flex items-center gap-2">
                      <Icon d={icons.clipboard} size={16} />
                      {portalCopied ? 'Copied!' : 'Portal Link'}
                    </span>
                  </Btn>
                )}
              </div>

              {/* Email sent success banner */}
              {emailSent && (
                <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2">
                  <Icon d={icons.check} size={16} stroke="#22c55e" />
                  <span className="text-sm text-success font-semibold">Invoice sent successfully!</span>
                </div>
              )}
              {textSent && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-center gap-2">
                  <Icon d={icons.message} size={16} stroke="#3b82f6" />
                  <span className="text-sm text-blue-400 font-semibold">Payment link texted to customer!</span>
                </div>
              )}

              {/* Payment info / Mark as Paid / Void / Send Payment Link */}
              {inv.status === 'Void' ? (
                <div className="bg-slate-800/50 border border-bdr rounded-lg p-4 flex items-center gap-3">
                  <Icon d={icons.x} size={20} stroke="#64748b" />
                  <div>
                    <div className="text-sm text-slate-400 font-semibold">Voided</div>
                    <div className="text-xs text-slate-500">
                      This invoice has been voided and excluded from revenue.
                    </div>
                  </div>
                </div>
              ) : inv.status === 'Paid' ? (
                <div className="space-y-3">
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
                  <Btn small variant="danger" onClick={voidInvoice} disabled={voiding}>
                    {voiding ? 'Voiding...' : 'Void Invoice'}
                  </Btn>
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

                  {/* Void */}
                  <div className="border-t border-bdr pt-4">
                    <Btn small variant="danger" onClick={voidInvoice} disabled={voiding}>
                      {voiding ? 'Voiding...' : 'Void Invoice'}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </SlideOver>

      {/* Send Email Modal */}
      {selectedInv && (
        <SendEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          onSend={sendInvoiceEmail}
          docType="Invoice"
          docNumber={selectedInv.display_id}
          customer={selectedInv.customer}
          vehicle={selectedInv.vehicle}
          laborLines={selectedInv.labor_lines || []}
          partsLines={selectedInv.parts_lines || []}
          laborTotal={selectedInv.labor_total}
          partsTotal={selectedInv.parts_total}
          grandTotal={selectedInv.total}
          tax={selectedInv.tax}
          showTax
          settings={shopSettings}
          paymentLink={selectedInv.stripe_payment_link}
        />
      )}
    </div>
  );
}
