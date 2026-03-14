'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Btn } from '@/components/ui/Btn';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import type { PurchaseOrder, POLine, POStatus, Vendor } from '@/lib/types';
import { PO_STATUS_LABELS } from '@/lib/types';

const STATUS_TABS: (POStatus | 'all')[] = ['all', 'draft', 'ordered', 'partially_received', 'received', 'cancelled'];

export default function PurchaseOrdersPage() {
  return <Suspense fallback={null}><PurchaseOrdersContent /></Suspense>;
}

function PurchaseOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all');
  const [vendorFilter, setVendorFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const [posRes, vendorsRes] = await Promise.all([
      fetch('/api/purchase-orders').then(r => r.json()),
      fetch('/api/vendors').then(r => r.json()),
    ]);
    if (Array.isArray(posRes)) setPOs(posRes);
    if (Array.isArray(vendorsRes)) setVendors(vendorsRes);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().then(() => {
      const openParam = searchParams.get('open');
      if (openParam) {
        // Fetch full PO detail by ID
        fetch(`/api/purchase-orders/${openParam}`).then(r => r.json()).then(po => {
          if (po && po.id) setSelectedPO(po);
        }).catch(() => {});
      }
    });
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = pos.filter(po => {
    if (statusFilter !== 'all' && po.status !== statusFilter) return false;
    if (vendorFilter && po.vendor_id !== vendorFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !po.display_id.toLowerCase().includes(s) &&
        !(po.vendor as Vendor | undefined)?.name?.toLowerCase().includes(s) &&
        !(po.work_order as { display_id: string } | undefined)?.display_id?.toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      {/* Parts Navigation */}
      <div className="flex gap-1 bg-card border border-bdr rounded-lg p-1 mb-4">
        <button
          onClick={() => router.push('/inventory')}
          className="px-4 py-1.5 rounded-md text-sm font-heading font-semibold text-slate-500 hover:text-slate-300 transition"
        >
          Inventory
        </button>
        <button className="px-4 py-1.5 rounded-md text-sm font-heading font-semibold bg-accent/15 text-accent">
          Purchase Orders
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-white text-xl tracking-wide">Purchase Orders</h1>
        <Btn onClick={() => setShowCreate(true)}>
          <span className="flex items-center gap-1.5">
            <Icon d={icons.plus} size={16} stroke="#fff" />
            New PO
          </span>
        </Btn>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 bg-card rounded-lg p-1 border border-bdr">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-[10px] font-heading font-bold uppercase tracking-wider px-3 py-1.5 rounded transition ${
                statusFilter === s
                  ? 'bg-accent/15 text-accent'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s === 'all' ? 'All' : PO_STATUS_LABELS[s]}
              <span className="ml-1 text-slate-600">
                {s === 'all' ? pos.length : pos.filter(p => p.status === s).length}
              </span>
            </button>
          ))}
        </div>

        {/* Vendor filter */}
        <select
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className="bg-card border border-bdr rounded-lg px-3 py-1.5 text-sm text-slate-300 font-body focus:outline-none focus:border-accent/50"
        >
          <option value="">All Vendors</option>
          {vendors.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Icon d={icons.search} size={14} stroke="#64748b" className="absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-bdr rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
            placeholder="Search PO#, vendor, WO#..."
          />
        </div>
      </div>

      {/* PO List */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Icon d={icons.truck} size={32} stroke="#334155" className="mx-auto mb-3" />
            <p className="text-sm text-slate-500">No purchase orders found</p>
            <p className="text-xs text-slate-600 mt-1">Create a PO to start tracking parts orders</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-bdr">
                <TH>PO #</TH>
                <TH>Vendor</TH>
                <TH>Work Order</TH>
                <TH>Lines</TH>
                <TH className="text-right">Total Cost</TH>
                <TH>Status</TH>
                <TH>Date</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-bdr/50">
              {filtered.map(po => (
                <tr
                  key={po.id}
                  onClick={() => setSelectedPO(po)}
                  className="hover:bg-surface/50 cursor-pointer transition"
                >
                  <TD>
                    <span className="text-accent font-heading font-bold text-sm">{po.display_id}</span>
                  </TD>
                  <TD>
                    <span className="text-slate-300 text-sm">
                      {(po.vendor as Vendor | undefined)?.name || '—'}
                    </span>
                  </TD>
                  <TD>
                    {po.work_order ? (
                      <Link href={`/work-orders?open=${po.work_order_id}`} onClick={e => e.stopPropagation()} className="text-xs font-mono text-accent hover:text-orange-400 transition">
                        {(po.work_order as { display_id: string }).display_id}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-600">Standalone</span>
                    )}
                  </TD>
                  <TD>
                    <span className="text-xs text-slate-400">{po.line_count} items</span>
                  </TD>
                  <TD className="text-right">
                    <span className="text-sm text-white font-medium">{fmt(po.total_cost || 0)}</span>
                  </TD>
                  <TD>
                    <StatusBadge status={PO_STATUS_LABELS[po.status]} />
                  </TD>
                  <TD>
                    <span className="text-xs text-slate-500">
                      {new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </TD>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create PO SlideOver */}
      <SlideOver open={showCreate} onClose={() => setShowCreate(false)} title="New Purchase Order" wide>
        <CreatePOForm
          vendors={vendors}
          onCreated={(po) => { setPOs(prev => [po, ...prev]); setShowCreate(false); setSelectedPO(po); }}
          onCancel={() => setShowCreate(false)}
        />
      </SlideOver>

      {/* PO Detail SlideOver */}
      <SlideOver
        open={!!selectedPO}
        onClose={() => setSelectedPO(null)}
        title={selectedPO?.display_id || 'Purchase Order'}
        wide
      >
        {selectedPO && (
          <PODetail
            po={selectedPO}
            vendors={vendors}
            onUpdate={(updated) => {
              setPOs(prev => prev.map(p => p.id === updated.id ? updated : p));
              setSelectedPO(updated);
            }}
            onDelete={() => {
              setPOs(prev => prev.filter(p => p.id !== selectedPO.id));
              setSelectedPO(null);
            }}
          />
        )}
      </SlideOver>
    </div>
  );
}

/* ============================================================
   CREATE PO FORM
   ============================================================ */
function CreatePOForm({
  vendors,
  onCreated,
  onCancel,
  prefillLines,
  prefillWorkOrderId,
}: {
  vendors: Vendor[];
  onCreated: (po: PurchaseOrder) => void;
  onCancel: () => void;
  prefillLines?: POLine[];
  prefillWorkOrderId?: string;
}) {
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POLine[]>(
    prefillLines || [{ name: '', part_number: null, qty_ordered: 1, qty_received: 0, unit_cost: 0 }]
  );
  const [saving, setSaving] = useState(false);

  const addLine = () => {
    setLines([...lines, { name: '', part_number: null, qty_ordered: 1, qty_received: 0, unit_cost: 0 }]);
  };

  const updateLine = (i: number, field: string, value: string | number) => {
    setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  };

  const removeLine = (i: number) => {
    setLines(lines.filter((_, idx) => idx !== i));
  };

  const totalCost = lines.reduce((sum, l) => sum + l.qty_ordered * Number(l.unit_cost), 0);

  const save = async () => {
    const validLines = lines.filter(l => l.name.trim());
    if (validLines.length === 0) return;

    setSaving(true);
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor_id: vendorId || null,
        work_order_id: prefillWorkOrderId || null,
        notes: notes || null,
        lines: validLines,
      }),
    });

    if (res.ok) {
      const po = await res.json();
      onCreated(po);
    }
    setSaving(false);
  };

  const inp = 'w-full bg-bg border border-bdr rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';

  return (
    <div className="space-y-4">
      {/* Vendor */}
      <div>
        <label className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1 block">Vendor</label>
        <select
          value={vendorId}
          onChange={e => setVendorId(e.target.value)}
          className={inp}
        >
          <option value="">Select vendor...</option>
          {vendors.map(v => (
            <option key={v.id} value={v.id}>{v.name}{v.account_number ? ` (${v.account_number})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1 block">Notes</label>
        <textarea
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className={`${inp} resize-none`}
          placeholder="Special instructions, reference numbers..."
        />
      </div>

      {/* Lines */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">Line Items</h4>
          <button onClick={addLine} className="text-accent hover:text-orange-400 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1">
            <Icon d={icons.plus} size={12} />
            Add Line
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="bg-bg border border-bdr rounded-lg p-3">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <label className="text-[10px] text-slate-600 uppercase">Part Name</label>
                  <input
                    value={line.name}
                    onChange={e => updateLine(i, 'name', e.target.value)}
                    className={inp}
                    placeholder="Part name"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-slate-600 uppercase">Part #</label>
                  <input
                    value={line.part_number || ''}
                    onChange={e => updateLine(i, 'part_number', e.target.value)}
                    className={inp}
                    placeholder="Optional"
                  />
                </div>
                <div className="col-span-1.5">
                  <label className="text-[10px] text-slate-600 uppercase">Qty</label>
                  <input
                    type="number"
                    value={line.qty_ordered}
                    onChange={e => updateLine(i, 'qty_ordered', parseInt(e.target.value) || 1)}
                    className={inp}
                    min="1"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-slate-600 uppercase">Unit Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={line.unit_cost || ''}
                    onChange={e => updateLine(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                    className={inp}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-0.5 flex items-end pb-1">
                  <button
                    onClick={() => removeLine(i)}
                    className="text-slate-600 hover:text-error transition p-1"
                  >
                    <Icon d={icons.x} size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {lines.length > 0 && (
          <div className="text-right text-sm text-slate-400 mt-2">
            Total: <span className="text-white font-semibold">{fmt(totalCost)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Btn onClick={save} disabled={saving || lines.every(l => !l.name.trim())}>
          {saving ? 'Creating...' : 'Create Purchase Order'}
        </Btn>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

/* ============================================================
   PO DETAIL
   ============================================================ */
function PODetail({
  po,
  vendors,
  onUpdate,
  onDelete,
}: {
  po: PurchaseOrder;
  vendors: Vendor[];
  onUpdate: (po: PurchaseOrder) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vendorId, setVendorId] = useState(po.vendor_id || '');
  const [notes, setNotes] = useState(po.notes || '');
  const [lines, setLines] = useState<POLine[]>(po.lines || []);
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totalCost = (po.lines || []).reduce((sum, l) => sum + l.qty_ordered * Number(l.unit_cost), 0);
  const isDraft = po.status === 'draft';
  const canReceive = po.status === 'ordered' || po.status === 'partially_received';
  const isCancelled = po.status === 'cancelled';

  const vendor = vendors.find(v => v.id === po.vendor_id);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/purchase-orders/${po.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor_id: vendorId || null,
        notes: notes || null,
        lines: lines.filter(l => l.name.trim()),
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
      setEditing(false);
    }
    setSaving(false);
  };

  const changeStatus = async (status: string) => {
    const res = await fetch(`/api/purchase-orders/${po.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
    }
  };

  const submitReceive = async () => {
    const linesToReceive = Object.entries(receiveQtys)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id, qty_received: qty }));

    if (linesToReceive.length === 0) return;

    setSaving(true);
    const res = await fetch(`/api/purchase-orders/${po.id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: linesToReceive }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdate(updated);
      setReceiving(false);
      setReceiveQtys({});
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/purchase-orders/${po.id}`, { method: 'DELETE' });
    if (res.ok) onDelete();
  };

  const inp = 'w-full bg-bg border border-bdr rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={PO_STATUS_LABELS[po.status]} />
        {po.work_order && (
          <Link href={`/work-orders?open=${po.work_order_id}`} className="text-xs font-mono text-accent hover:text-orange-400 bg-bg px-2 py-1 rounded border border-bdr transition">
            WO: {(po.work_order as { display_id: string }).display_id} &rarr;
          </Link>
        )}
        <span className="text-xs text-slate-500">
          Created {new Date(po.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {/* Vendor info */}
      {vendor && !editing && (
        <div className="bg-bg rounded-lg border border-bdr p-3">
          <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Vendor</div>
          <div className="text-sm text-white font-medium">{vendor.name}</div>
          {vendor.contact_name && <div className="text-xs text-slate-400">{vendor.contact_name}</div>}
          <div className="text-xs text-slate-500 mt-1">
            {[vendor.phone, vendor.email].filter(Boolean).join(' · ')}
            {vendor.account_number && <span className="ml-2 font-mono">Acct: {vendor.account_number}</span>}
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editing && isDraft ? (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1 block">Vendor</label>
            <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={inp}>
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1 block">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={`${inp} resize-none`} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">Lines</h4>
              <button
                onClick={() => setLines([...lines, { name: '', part_number: null, qty_ordered: 1, qty_received: 0, unit_cost: 0 }])}
                className="text-accent hover:text-orange-400 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Icon d={icons.plus} size={12} />
                Add Line
              </button>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="bg-bg border border-bdr rounded-lg p-2 mb-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <input value={line.name} onChange={e => {
                      const nl = [...lines]; nl[i] = { ...nl[i], name: e.target.value }; setLines(nl);
                    }} className={inp} placeholder="Part name" />
                  </div>
                  <div className="col-span-3">
                    <input value={line.part_number || ''} onChange={e => {
                      const nl = [...lines]; nl[i] = { ...nl[i], part_number: e.target.value || null }; setLines(nl);
                    }} className={inp} placeholder="Part #" />
                  </div>
                  <div className="col-span-1">
                    <input type="number" value={line.qty_ordered} onChange={e => {
                      const nl = [...lines]; nl[i] = { ...nl[i], qty_ordered: parseInt(e.target.value) || 1 }; setLines(nl);
                    }} className={inp} min="1" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" step="0.01" value={line.unit_cost || ''} onChange={e => {
                      const nl = [...lines]; nl[i] = { ...nl[i], unit_cost: parseFloat(e.target.value) || 0 }; setLines(nl);
                    }} className={inp} placeholder="Cost" />
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <button onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-slate-600 hover:text-error transition">
                      <Icon d={icons.x} size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn small onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Btn>
            <Btn small variant="secondary" onClick={() => { setEditing(false); setLines(po.lines || []); setVendorId(po.vendor_id || ''); setNotes(po.notes || ''); }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <>
          {/* Notes */}
          {po.notes && (
            <div>
              <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Notes</div>
              <p className="text-sm text-slate-300">{po.notes}</p>
            </div>
          )}

          {/* Lines table */}
          <div>
            <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">
              Line Items
            </h4>
            {(po.lines || []).length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bdr">
                    <TH>Part</TH>
                    <TH className="text-right">Ordered</TH>
                    <TH className="text-right">Received</TH>
                    <TH className="text-right">Unit Cost</TH>
                    <TH className="text-right">Total</TH>
                    {receiving && <TH className="text-right">Receive</TH>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-bdr/50">
                  {(po.lines || []).map((line) => {
                    const lineId = line.id || '';
                    const fullyReceived = line.qty_received >= line.qty_ordered;
                    return (
                      <tr key={lineId} className={fullyReceived ? 'opacity-50' : ''}>
                        <TD>
                          <div className="text-sm text-slate-300">{line.name}</div>
                          {line.part_number && (
                            <div className="text-[10px] font-mono text-slate-600">{line.part_number}</div>
                          )}
                        </TD>
                        <TD className="text-right text-slate-400 text-sm">{line.qty_ordered}</TD>
                        <TD className="text-right text-sm">
                          <span className={line.qty_received >= line.qty_ordered ? 'text-success' : line.qty_received > 0 ? 'text-yellow-400' : 'text-slate-500'}>
                            {line.qty_received}
                          </span>
                        </TD>
                        <TD className="text-right text-slate-400 text-sm">{fmt(line.unit_cost)}</TD>
                        <TD className="text-right text-white font-medium text-sm">{fmt(line.qty_ordered * line.unit_cost)}</TD>
                        {receiving && (
                          <TD className="text-right">
                            {fullyReceived ? (
                              <span className="text-[10px] text-success font-heading uppercase">Done</span>
                            ) : (
                              <input
                                type="number"
                                min={line.qty_received}
                                max={line.qty_ordered}
                                value={receiveQtys[lineId] ?? line.qty_received}
                                onChange={e => setReceiveQtys({ ...receiveQtys, [lineId]: parseInt(e.target.value) || 0 })}
                                className="w-16 bg-bg border border-bdr rounded px-2 py-1 text-sm text-slate-200 text-right focus:outline-none focus:border-accent/50"
                              />
                            )}
                          </TD>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-600 bg-bg rounded-lg p-3 border border-bdr text-center">
                No line items
              </div>
            )}

            <div className="text-right text-sm text-slate-400 mt-2">
              Total Cost: <span className="text-white font-semibold">{fmt(totalCost)}</span>
            </div>
          </div>
        </>
      )}

      {/* Action buttons */}
      {!editing && !isCancelled && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-bdr">
          {isDraft && (
            <>
              <Btn small onClick={() => setEditing(true)}>
                <span className="flex items-center gap-1"><Icon d={icons.edit} size={12} stroke="#fff" /> Edit</span>
              </Btn>
              <Btn small variant="success" onClick={() => changeStatus('ordered')}>
                Mark Ordered
              </Btn>
              <Btn small variant="danger" onClick={() => changeStatus('cancelled')}>
                Cancel PO
              </Btn>
            </>
          )}
          {canReceive && !receiving && (
            <>
              <Btn small onClick={() => {
                // Initialize receive qtys to current received amounts
                const initial: Record<string, number> = {};
                (po.lines || []).forEach(l => {
                  if (l.id && l.qty_received < l.qty_ordered) {
                    initial[l.id] = l.qty_received;
                  }
                });
                setReceiveQtys(initial);
                setReceiving(true);
              }}>
                <span className="flex items-center gap-1"><Icon d={icons.check} size={12} stroke="#fff" /> Receive Parts</span>
              </Btn>
              <Btn small variant="danger" onClick={() => changeStatus('cancelled')}>
                Cancel PO
              </Btn>
            </>
          )}
          {receiving && (
            <>
              <Btn small onClick={submitReceive} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm Received'}
              </Btn>
              <Btn small variant="secondary" onClick={() => { setReceiving(false); setReceiveQtys({}); }}>
                Cancel
              </Btn>
            </>
          )}
        </div>
      )}

      {/* Delete — draft only */}
      {isDraft && !editing && (
        <div className="border-t border-bdr pt-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-xs text-slate-600 hover:text-error transition font-heading uppercase tracking-wider"
            >
              <Icon d={icons.trash} size={14} />
              Delete Purchase Order
            </button>
          ) : (
            <div className="bg-error/5 border border-error/20 rounded-xl p-4">
              <p className="text-sm text-error font-semibold mb-1">Delete {po.display_id}?</p>
              <p className="text-xs text-slate-500 mb-3">This will permanently remove this purchase order and all line items.</p>
              <div className="flex gap-2">
                <Btn small variant="danger" onClick={handleDelete}>Yes, Delete</Btn>
                <Btn small variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
