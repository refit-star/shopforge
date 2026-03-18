'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { EmptyState } from '@/components/ui/EmptyState';
import { TH, TD } from '@/components/ui/Table';
import { SendEmailModal, generateEmailHTML } from '@/components/ui/SendEmailModal';
import { fmt, printDocument } from '@/lib/utils';
import { NewEstimateModal } from '@/components/NewEstimateModal';
import type { Estimate, Customer, Vehicle, Tech, ShopSettings, LaborLine, PartsLine } from '@/lib/types';

export default function EstimatesPage() {
  return <Suspense fallback={null}><EstimatesContent /></Suspense>;
}

function EstimatesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Estimate | null>(null);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [convertDate, setConvertDate] = useState('');
  const [converting, setConverting] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const fetchEstimates = async () => {
    const json = await fetch('/api/estimates').then(r => r.json());
    setEstimates(Array.isArray(json) ? json : json.data ?? []);
  };

  useEffect(() => {
    Promise.all([
      fetchEstimates(),
      fetch('/api/techs').then(r => r.json()).then(setTechs),
      fetch('/api/settings').then(r => r.json()).then(setSettings),
    ]).then(() => {
      setLoaded(true);
      const openParam = searchParams.get('open');
      if (openParam) {
        openEstimate({ id: openParam } as Estimate);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openEstimate = async (est: Estimate) => {
    const res = await fetch(`/api/estimates/${est.id}`);
    setSelected(await res.json());
  };

  const convertToWO = async (scheduledDate?: string) => {
    if (!selected) return;
    setConverting(true);
    const res = await fetch(`/api/estimates/${selected.id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_date: scheduledDate || null }),
    });
    setConverting(false);
    setShowConvertModal(false);
    setConvertDate('');
    if (res.ok) {
      const wo = await res.json();
      setSelected(null);
      router.push(`/work-orders?open=${wo.id}`);
    } else {
      await fetchEstimates();
      setSelected(null);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/estimates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchEstimates();
    const res = await fetch(`/api/estimates/${id}`);
    setSelected(await res.json());
  };

  const deleteEstimate = async (id: string) => {
    await fetch(`/api/estimates/${id}`, { method: 'DELETE' });
    setSelected(null);
    await fetchEstimates();
  };

  const sendEstimateEmail = async (recipientEmail: string) => {
    if (!selected) return;
    const shopName = settings?.shop_name || 'ShopForge';
    const vehicleStr = selected.vehicle ? `${selected.vehicle.year || ''} ${selected.vehicle.make} ${selected.vehicle.model}`.trim() : '';
    const emailBody = generateEmailHTML({
      docType: 'Estimate',
      docNumber: selected.display_id,
      customer: selected.customer,
      vehicleStr,
      laborLines: selected.labor_lines || [],
      partsLines: selected.parts_lines || [],
      laborTotal: selected.labor_total || 0,
      partsTotal: selected.parts_total || 0,
      grandTotal: selected.estimated_total || 0,
      shopName,
      shopPhone: settings?.phone || '',
      shopEmail: settings?.email || '',
      shopAddress: settings?.address || '',
      logoUrl: settings?.logo_url,
      footer: settings?.invoice_footer || 'Thank you for your business!',
    });

    // Log as notification in the database
    const notifRes = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selected.customer_id,
        type: 'estimate_sent',
        channel: 'email',
        message: `Estimate ${selected.display_id} (${fmt(selected.estimated_total || 0)}) emailed to ${recipientEmail}.`,
      }),
    });
    const notif = await notifRes.json();

    // Send the actual email via Resend
    const sendRes = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `${shopName} - Estimate ${selected.display_id}`,
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

    // Update estimate status to Sent
    await updateStatus(selected.id, 'Sent');
    setShowEmailModal(false);
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 4000);
  };

  const sendEstimateSms = async () => {
    if (!selected) return;
    setSmsSending(true);
    try {
      const res = await fetch(`/api/estimates/${selected.id}/share`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.sms_sent) {
          // Update status to Sent if currently Draft
          if (selected.status === 'Draft') {
            await updateStatus(selected.id, 'Sent');
          }
          setSmsSent(true);
          setTimeout(() => setSmsSent(false), 4000);
        } else {
          alert('Customer has no phone number on file.');
        }
      } else {
        const err = await res.json();
        alert('SMS failed: ' + (err.error || 'Unknown error'));
      }
    } catch {
      alert('SMS send failed. Check Twilio configuration in Settings.');
    }
    setSmsSending(false);
  };

  const defaultRate = settings?.default_labor_rate ? Number(settings.default_labor_rate) : 125;

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 bg-card border border-bdr rounded-lg animate-pulse" />
        <div className="bg-card border border-bdr rounded-xl h-[500px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-white tracking-wide">Estimates</h1>
        <Btn onClick={() => setShowNew(true)}>
          <span className="flex items-center gap-2"><Icon d={icons.plus} size={16} />New Estimate</span>
        </Btn>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {(['Draft', 'Sent', 'Approved', 'Declined'] as const).map(s => {
          const count = estimates.filter(e => e.status === s).length;
          return (
            <div key={s} className="bg-card border border-bdr rounded-xl p-4">
              <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">{s}</div>
              <div className="text-2xl font-heading font-bold text-white">{count}</div>
            </div>
          );
        })}
      </div>

      {estimates.length === 0 ? (
        <EmptyState
          icon={icons.clipboard}
          title="No Estimates Yet"
          description="Create your first estimate to start tracking potential jobs and converting them to work orders."
          action={{ label: 'New Estimate', onClick: () => setShowNew(true) }}
        />
      ) : (
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-bdr">
              <TH>Estimate #</TH><TH>Customer</TH><TH>Vehicle</TH><TH>Service</TH><TH>Total</TH><TH>Status</TH>
            </tr>
          </thead>
          <tbody>
            {estimates.map(e => (
              <tr key={e.id} onClick={() => openEstimate(e)} className="border-b border-bdr/50 hover:bg-surface/30 cursor-pointer transition">
                <TD><span className="text-accent font-semibold">{e.display_id}</span></TD>
                <TD>{e.customer?.name || '—'}</TD>
                <TD>{e.vehicle ? `${e.vehicle.year || ''} ${e.vehicle.make} ${e.vehicle.model}` : '—'}</TD>
                <TD><span className="truncate block max-w-[200px]">{e.job}</span></TD>
                <TD>{fmt(e.estimated_total || 0)}</TD>
                <TD><StatusBadge status={e.status} /></TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* New Estimate Modal */}
      <NewEstimateModal open={showNew} onClose={() => setShowNew(false)} onCreated={(id) => { fetchEstimates(); setShowNew(false); if (id) openEstimate({ id } as Estimate); }} defaultRate={defaultRate} />

      {/* Estimate Detail */}
      <SlideOver open={!!selected} onClose={() => setSelected(null)} title={selected ? `Estimate ${selected.display_id}` : ''} wide>
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-1">Customer</div>
                <Link href={`/customers?open=${selected.customer_id}`} className="text-sm text-accent hover:text-orange-400 transition">{selected.customer?.name}</Link>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-1">Vehicle</div>
                <div className="text-sm text-white">{selected.vehicle ? `${selected.vehicle.year || ''} ${selected.vehicle.make} ${selected.vehicle.model}` : '—'}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-1">Service</div>
              <div className="text-sm text-white">{selected.job}</div>
            </div>
            {selected.notes && (
              <div>
                <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-1">Notes</div>
                <div className="text-sm text-slate-300">{selected.notes}</div>
              </div>
            )}

            {/* Labor */}
            {(selected.labor_lines?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-2">Labor</div>
                <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
                  {selected.labor_lines!.map((l, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 border-b border-bdr/50 last:border-0 text-xs">
                      <span className="text-slate-300">{l.description}</span>
                      <span className="text-slate-400">{l.hours}h x {fmt(l.rate)} = {fmt(l.hours * l.rate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parts */}
            {(selected.parts_lines?.length ?? 0) > 0 && (
              <div>
                <div className="text-xs text-slate-500 uppercase font-heading font-semibold tracking-wider mb-2">Parts</div>
                <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
                  {selected.parts_lines!.map((p, i) => (
                    <div key={i} className="flex justify-between px-3 py-2 border-b border-bdr/50 last:border-0 text-xs">
                      <span className="text-slate-300">{p.name}</span>
                      <span className="text-slate-400">{p.qty} x {fmt(p.price)} = {fmt(p.qty * p.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="bg-bg rounded-lg p-3 border border-bdr">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-slate-500">Labor</span>
                <span className="text-slate-300">{fmt(selected.labor_total || 0)}</span>
              </div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Parts</span>
                <span className="text-slate-300">{fmt(selected.parts_total || 0)}</span>
              </div>
              <div className="border-t border-bdr my-1" />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-white">Estimated Total</span>
                <span className="text-accent">{fmt(selected.estimated_total || 0)}</span>
              </div>
            </div>

            {/* Signature info for approved estimates */}
            {selected.status === 'Approved' && selected.approved_at && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon d={icons.check} size={14} stroke="#22c55e" />
                  <span className="text-xs font-heading font-semibold text-success uppercase tracking-wider">Signed & Approved</span>
                </div>
                <div className="text-xs text-slate-300">
                  {selected.approved_by && <span>Signed by <strong className="text-white">{selected.approved_by}</strong></span>}
                  {selected.approved_at && (
                    <span> on {new Date(selected.approved_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  )}
                </div>
                {!!(selected as unknown as Record<string, unknown>).portal_token && (
                  <a
                    href={`/api/portal/${(selected as unknown as Record<string, unknown>).portal_token}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs text-accent hover:text-orange-400 underline"
                  >
                    <Icon d={icons.print} size={12} />
                    Download Signed PDF
                  </a>
                )}
              </div>
            )}

            {/* Print */}
            <Btn variant="secondary" onClick={() => {
              const s = settings;
              const vehicleStr = selected.vehicle ? `${selected.vehicle.year || ''} ${selected.vehicle.make} ${selected.vehicle.model}` : '';
              printDocument({
                title: selected.display_id,
                docNumber: selected.display_id,
                docLabel: 'Estimate',
                docDate: new Date(selected.created_at).toLocaleDateString(),
                shopName: s?.shop_name || 'ShopForge',
                shopAddress: s?.address || '',
                shopPhone: s?.phone || '',
                shopEmail: s?.email || '',
                customerName: selected.customer?.name || '',
                vehicleStr,
                laborLines: selected.labor_lines || [],
                partsLines: selected.parts_lines || [],
                laborTotal: selected.labor_total || 0,
                partsTotal: selected.parts_total || 0,
                grandTotal: selected.estimated_total || 0,
                notes: selected.notes,
                footer: s?.invoice_footer || 'Thank you for your business!',
                logoUrl: s?.logo_url,
              });
            }}>
              <span className="flex items-center gap-2"><Icon d={icons.print} size={16} />Print Estimate</span>
            </Btn>

            {/* Copy Portal Link */}
            {!!(selected as unknown as Record<string, unknown>).portal_token && (
              <Btn variant="secondary" onClick={() => {
                const url = `${window.location.origin}/portal/${(selected as unknown as Record<string, unknown>).portal_token}`;
                navigator.clipboard.writeText(url);
                setPortalCopied(true);
                setTimeout(() => setPortalCopied(false), 3000);
              }}>
                <span className="flex items-center gap-2">
                  <Icon d={icons.clipboard} size={16} />
                  {portalCopied ? 'Link Copied!' : 'Copy Portal Link'}
                </span>
              </Btn>
            )}

            {/* Email sent success banner */}
            {emailSent && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2">
                <Icon d={icons.check} size={16} stroke="#22c55e" />
                <span className="text-sm text-success font-semibold">Estimate sent successfully!</span>
              </div>
            )}

            {/* SMS sent success banner */}
            {smsSent && (
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-2">
                <Icon d={icons.check} size={16} stroke="#22c55e" />
                <span className="text-sm text-success font-semibold">Estimate texted to customer!</span>
              </div>
            )}

            {/* Status + Actions */}
            <div className="flex items-center justify-between pt-2">
              <StatusBadge status={selected.status} />
              <div className="flex gap-2 flex-wrap">
                {(selected.status === 'Draft' || selected.status === 'Sent') && (
                  <Btn small variant="secondary" onClick={() => setShowEdit(true)}>
                    <span className="flex items-center gap-1.5"><Icon d={icons.edit} size={13} />Edit</span>
                  </Btn>
                )}
                {selected.status === 'Draft' && (
                  <>
                    <Btn small onClick={() => setShowEmailModal(true)}>
                      <span className="flex items-center gap-1.5"><Icon d={icons.send} size={13} />Send to Customer</span>
                    </Btn>
                    <Btn small variant="secondary" onClick={sendEstimateSms} disabled={smsSending}>
                      <span className="flex items-center gap-1.5"><Icon d={icons.message} size={13} />{smsSending ? 'Texting...' : 'Text to Customer'}</span>
                    </Btn>
                  </>
                )}
                {selected.status === 'Sent' && (
                  <>
                    <Btn small variant="secondary" onClick={() => setShowEmailModal(true)}>
                      <span className="flex items-center gap-1.5"><Icon d={icons.send} size={13} />Resend</span>
                    </Btn>
                    <Btn small variant="secondary" onClick={sendEstimateSms} disabled={smsSending}>
                      <span className="flex items-center gap-1.5"><Icon d={icons.message} size={13} />{smsSending ? 'Texting...' : 'Text Again'}</span>
                    </Btn>
                    <Btn small variant="success" onClick={() => updateStatus(selected.id, 'Approved')}>Approve</Btn>
                    <Btn small variant="danger" onClick={() => updateStatus(selected.id, 'Declined')}>Decline</Btn>
                  </>
                )}
                {selected.status === 'Approved' && (
                  <Btn small onClick={() => { setConvertDate(''); setShowConvertModal(true); }}>Convert to Work Order</Btn>
                )}
                <Btn small variant="danger" onClick={() => deleteEstimate(selected.id)}>Delete</Btn>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Send Email Modal */}
      {selected && (
        <SendEmailModal
          open={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          onSend={sendEstimateEmail}
          docType="Estimate"
          docNumber={selected.display_id}
          customer={selected.customer}
          vehicle={selected.vehicle}
          laborLines={selected.labor_lines || []}
          partsLines={selected.parts_lines || []}
          laborTotal={selected.labor_total || 0}
          partsTotal={selected.parts_total || 0}
          grandTotal={selected.estimated_total || 0}
          settings={settings}
        />
      )}

      {/* Convert to WO — Schedule Modal */}
      <Modal open={showConvertModal} onClose={() => setShowConvertModal(false)} title="Convert to Work Order">
        <div className="space-y-5">
          <p className="text-sm text-slate-400">
            Choose when to schedule this work order, or convert it as unscheduled.
          </p>

          {/* Date picker */}
          <div>
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Schedule Date
            </label>
            <input
              type="date"
              value={convertDate}
              onChange={e => setConvertDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Btn
              onClick={() => convertToWO(convertDate)}
              disabled={converting || !convertDate}
            >
              <span className="flex items-center gap-2">
                <Icon d={icons.calendar} size={16} />
                {converting ? 'Converting...' : 'Schedule & Convert'}
              </span>
            </Btn>
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-bdr" />
              <span className="text-[10px] text-slate-600 uppercase font-heading font-semibold tracking-wider">or</span>
              <div className="flex-1 border-t border-bdr" />
            </div>
            <Btn
              variant="secondary"
              onClick={() => convertToWO()}
              disabled={converting}
            >
              {converting ? 'Converting...' : 'Convert Unscheduled'}
            </Btn>
          </div>
        </div>
      </Modal>
      {/* Edit Estimate Modal */}
      {selected && (
        <EditEstimateModal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          estimate={selected}
          defaultRate={defaultRate}
          onSaved={async () => {
            setShowEdit(false);
            await fetchEstimates();
            const res = await fetch(`/api/estimates/${selected.id}`);
            setSelected(await res.json());
          }}
        />
      )}
    </div>
  );
}

/* ── Edit Estimate Modal ── */
function EditEstimateModal({ open, onClose, estimate, defaultRate, onSaved }: {
  open: boolean; onClose: () => void; estimate: Estimate; defaultRate: number; onSaved: () => void;
}) {
  const [job, setJob] = useState(estimate.job);
  const [notes, setNotes] = useState(estimate.notes || '');
  const [laborLines, setLaborLines] = useState<LaborLine[]>(estimate.labor_lines || []);
  const [partsLines, setPartsLines] = useState<PartsLine[]>(estimate.parts_lines || []);
  const [showLabor, setShowLabor] = useState(false);
  const [showPart, setShowPart] = useState(false);
  const [lDesc, setLDesc] = useState(''); const [lHrs, setLHrs] = useState('1'); const [lRate, setLRate] = useState(String(defaultRate));
  const [pName, setPName] = useState(''); const [pQty, setPQty] = useState('1'); const [pPrice, setPPrice] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-sync when estimate changes
  useEffect(() => {
    setJob(estimate.job);
    setNotes(estimate.notes || '');
    setLaborLines(estimate.labor_lines || []);
    setPartsLines(estimate.parts_lines || []);
  }, [estimate]);

  const submit = async () => {
    if (!job.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/estimates/${estimate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job,
        notes: notes || null,
        labor_lines: laborLines.map((l, i) => ({ description: l.description, hours: l.hours, rate: l.rate, sort_order: i })),
        parts_lines: partsLines.map((p, i) => ({ name: p.name, qty: p.qty, price: p.price, sort_order: i })),
      }),
    });
    setSaving(false);
    if (res.ok) onSaved();
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const inpSm = 'w-full bg-card border border-bdr rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${estimate.display_id}`} wide>
      <div className="space-y-4">
        {/* Customer & Vehicle (read-only) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Customer</label>
            <div className="text-sm text-slate-400 px-3 py-2.5">{estimate.customer?.name || '—'}</div>
          </div>
          <div>
            <label className={lbl}>Vehicle</label>
            <div className="text-sm text-slate-400 px-3 py-2.5">{estimate.vehicle ? `${estimate.vehicle.year || ''} ${estimate.vehicle.make} ${estimate.vehicle.model}` : '—'}</div>
          </div>
        </div>

        <div>
          <label className={lbl}>Service Description *</label>
          <input value={job} onChange={e => setJob(e.target.value)} className={inp} />
        </div>

        <div>
          <label className={lbl}>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={`${inp} resize-none`} />
        </div>

        {/* Labor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Labor</label>
            <button onClick={() => setShowLabor(!showLabor)} className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Labor
            </button>
          </div>
          {showLabor && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={lDesc} onChange={e => setLDesc(e.target.value)} className={`${inpSm} !bg-card`} placeholder="Labor description..." />
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] text-slate-600 uppercase">Hours</label><input type="number" step="0.1" value={lHrs} onChange={e => setLHrs(e.target.value)} className={inpSm} /></div>
                <div><label className="text-[10px] text-slate-600 uppercase">Rate/hr</label><input type="number" step="0.01" value={lRate} onChange={e => setLRate(e.target.value)} className={inpSm} /></div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => { if (!lDesc.trim()) return; setLaborLines(p => [...p, { description: lDesc, hours: parseFloat(lHrs)||1, rate: parseFloat(lRate)||defaultRate }]); setLDesc(''); setLHrs('1'); setLRate(String(defaultRate)); setShowLabor(false); }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowLabor(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {laborLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {laborLines.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0"><span className="text-xs text-slate-300 truncate block">{l.description}</span><span className="text-[10px] text-slate-500">{l.hours}h x {fmt(l.rate)} = {fmt(l.hours*l.rate)}</span></div>
                  <button onClick={() => setLaborLines(p => p.filter((_,idx) => idx!==i))} className="text-slate-600 hover:text-error ml-2"><Icon d={icons.x} size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parts */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Parts</label>
            <button onClick={() => setShowPart(!showPart)} className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Part
            </button>
          </div>
          {showPart && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={pName} onChange={e => setPName(e.target.value)} className={`${inpSm} !bg-card`} placeholder="Part name..." />
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] text-slate-600 uppercase">Qty</label><input type="number" value={pQty} onChange={e => setPQty(e.target.value)} className={inpSm} /></div>
                <div><label className="text-[10px] text-slate-600 uppercase">Price</label><input type="number" step="0.01" value={pPrice} onChange={e => setPPrice(e.target.value)} className={inpSm} placeholder="0.00" /></div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => { if (!pName.trim()) return; setPartsLines(p => [...p, { name: pName, qty: parseInt(pQty)||1, price: parseFloat(pPrice)||0 }]); setPName(''); setPQty('1'); setPPrice(''); setShowPart(false); }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowPart(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {partsLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {partsLines.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0"><span className="text-xs text-slate-300 truncate block">{p.name}</span><span className="text-[10px] text-slate-500">{p.qty} x {fmt(p.price)} = {fmt(p.qty*p.price)}</span></div>
                  <button onClick={() => setPartsLines(prev => prev.filter((_,idx) => idx!==i))} className="text-slate-600 hover:text-error ml-2"><Icon d={icons.x} size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        {(laborLines.length > 0 || partsLines.length > 0) && (
          <div className="bg-bg rounded-lg p-3 border border-bdr">
            <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-500">Labor</span><span className="text-slate-300">{fmt(laborLines.reduce((s,l) => s+l.hours*l.rate, 0))}</span></div>
            <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Parts</span><span className="text-slate-300">{fmt(partsLines.reduce((s,p) => s+p.qty*p.price, 0))}</span></div>
            <div className="border-t border-bdr my-1" />
            <div className="flex justify-between text-sm font-bold"><span className="text-white">Estimated Total</span><span className="text-accent">{fmt(laborLines.reduce((s,l) => s+l.hours*l.rate, 0) + partsLines.reduce((s,p) => s+p.qty*p.price, 0))}</span></div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={!job.trim() || saving}>{saving ? 'Saving...' : 'Save Changes'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

