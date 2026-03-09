'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Btn } from '@/components/ui/Btn';
import { PriorityBar } from '@/components/ui/PriorityBar';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import {
  WorkOrder,
  Tech,
  STATUS_COLORS,
  PRIORITY_COLORS,
  type WOStatus,
} from '@/lib/types';

const KANBAN_COLS: WOStatus[] = ['Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup'];
const COL_COLORS: Record<string, string> = {
  'Check-In': '#3b82f6',
  'In Progress': '#f97316',
  'Waiting on Parts': '#fbbf24',
  'Ready for Pickup': '#22c55e',
};

export default function WorkOrdersPage() {
  return (
    <Suspense fallback={null}>
      <WorkOrdersContent />
    </Suspense>
  );
}

function WorkOrdersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchWorkOrders = useCallback(async () => {
    const data = await fetch('/api/work-orders').then((r) => r.json());
    setWorkOrders(data);
    return data as WorkOrder[];
  }, []);

  const generateInvoice = async (wo: WorkOrder) => {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_order_id: wo.id,
        customer_id: wo.customer_id,
        vehicle_id: wo.vehicle_id,
      }),
    });
    if (res.ok) {
      // Mark WO as Completed
      await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      setSelectedWO(null);
      router.push('/invoicing');
    }
  };

  useEffect(() => {
    Promise.all([
      fetchWorkOrders(),
      fetch('/api/techs').then((r) => r.json()),
    ]).then(([wo, t]) => {
      setTechs(t);
      setLoaded(true);

      // Auto-open WO from search params
      const woParam = searchParams.get('wo');
      if (woParam) {
        const match = wo.find((w: WorkOrder) => w.display_id === woParam);
        if (match) setSelectedWO(match);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (woId: string, newStatus: WOStatus) => {
    await fetch(`/api/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const updated = await fetchWorkOrders();
    // Update the selected WO to reflect new state
    if (selectedWO && selectedWO.id === woId) {
      const refreshed = updated.find((w: WorkOrder) => w.id === woId);
      if (refreshed) setSelectedWO(refreshed);
    }
  };

  if (!loaded) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-slate-400 text-sm">{workOrders.length} total work orders</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {KANBAN_COLS.map((col) => {
          const items = workOrders.filter((w) => w.status === col);
          return (
            <div key={col} className="kanban-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: COL_COLORS[col] }} />
                <span className="font-heading font-semibold text-sm text-slate-300 uppercase tracking-wider">
                  {col}
                </span>
                <span className="ml-auto text-xs text-slate-500 bg-surface px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
              <div className="space-y-3">
                {items.map((w) => {
                  const vehicleStr = w.vehicle
                    ? `${w.vehicle.year || ''} ${w.vehicle.make} ${w.vehicle.model}`
                    : '';
                  return (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWO(w)}
                      className="relative bg-card border border-bdr rounded-xl p-4 pl-5 cursor-pointer hover:border-slate-500 transition group"
                    >
                      <PriorityBar priority={w.priority} />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-accent text-xs font-bold font-heading">{w.display_id}</span>
                        <span className="text-[11px] text-slate-500">{w.labor_hours || 0}h</span>
                      </div>
                      <div className="text-sm text-slate-200 font-medium mb-1">{vehicleStr}</div>
                      <div className="text-xs text-slate-400 mb-3">{w.job}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {w.tech && (
                            <>
                              <div
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                                style={{ background: w.tech.color + '25', color: w.tech.color }}
                              >
                                {w.tech.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')}
                              </div>
                              <span className="text-xs text-slate-500">{w.tech.name.split(' ')[0]}</span>
                            </>
                          )}
                        </div>
                        <span className="text-sm text-slate-300 font-semibold">
                          {fmt(w.estimated_total || 0)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* WO Detail Slide-Over */}
      <SlideOver
        open={!!selectedWO}
        onClose={() => setSelectedWO(null)}
        title={selectedWO ? `${selectedWO.display_id} — ${selectedWO.job}` : ''}
      >
        {selectedWO && <WODetail wo={selectedWO} changeStatus={changeStatus} generateInvoice={generateInvoice} />}
      </SlideOver>
    </div>
  );
}

function WODetail({
  wo,
  changeStatus,
  generateInvoice,
}: {
  wo: WorkOrder;
  changeStatus: (id: string, status: WOStatus) => void;
  generateInvoice: (wo: WorkOrder) => void;
}) {
  const [invoicing, setInvoicing] = useState(false);
  const laborLines = wo.labor_lines || [];
  const partsLines = wo.parts_lines || [];
  const laborSum = laborLines.reduce((s, l) => s + l.hours * l.rate, 0);
  const partsSum = partsLines.reduce((s, p) => s + p.qty * p.price, 0);

  const vehicleStr = wo.vehicle
    ? `${wo.vehicle.year || ''} ${wo.vehicle.make} ${wo.vehicle.model}`
    : '';

  const createdDate = wo.created_at
    ? new Date(wo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Customer</div>
          <div className="text-sm text-white font-medium">{wo.customer?.name}</div>
        </div>
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Vehicle</div>
          <div className="text-sm text-white font-medium">{vehicleStr}</div>
        </div>
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Technician</div>
          <div className="text-sm font-medium flex items-center gap-2" style={{ color: wo.tech?.color }}>
            {wo.tech?.name}
          </div>
        </div>
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Status</div>
          <StatusBadge status={wo.status} />
        </div>
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Priority</div>
          <span
            className={`text-sm font-medium capitalize ${
              wo.priority === 'high'
                ? 'text-error'
                : wo.priority === 'medium'
                  ? 'text-warning'
                  : 'text-success'
            }`}
          >
            {wo.priority}
          </span>
        </div>
        <div className="bg-bg rounded-lg p-3 border border-bdr">
          <div className="text-[11px] font-heading text-slate-500 uppercase tracking-wider mb-1">Created</div>
          <div className="text-sm text-white">{createdDate}</div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">Notes</h4>
        <div className="bg-bg rounded-lg p-3 border border-bdr text-sm text-slate-400 leading-relaxed">
          {wo.notes || 'No notes.'}
        </div>
      </div>

      {/* Labor Lines */}
      <div>
        <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">Labor Lines</h4>
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
            {laborLines.map((l, i) => (
              <tr key={i}>
                <TD className="text-slate-300">{l.description}</TD>
                <TD className="text-right text-slate-400">{l.hours}</TD>
                <TD className="text-right text-slate-400">{fmt(l.rate)}</TD>
                <TD className="text-right text-white font-medium">{fmt(l.hours * l.rate)}</TD>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-right text-sm text-slate-400 mt-2">
          Labor Total: <span className="text-white font-semibold">{fmt(laborSum)}</span>
        </div>
      </div>

      {/* Parts */}
      {partsLines.length > 0 && (
        <div>
          <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-2">Parts</h4>
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
              {partsLines.map((p, i) => (
                <tr key={i}>
                  <TD className="text-slate-300">{p.name}</TD>
                  <TD className="text-right text-slate-400">{p.qty}</TD>
                  <TD className="text-right text-slate-400">{fmt(p.price)}</TD>
                  <TD className="text-right text-white font-medium">{fmt(p.qty * p.price)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right text-sm text-slate-400 mt-2">
            Parts Total: <span className="text-white font-semibold">{fmt(partsSum)}</span>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-bg rounded-lg p-4 border border-bdr">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-400">Labor</span>
          <span className="text-slate-200">{fmt(laborSum)}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-400">Parts</span>
          <span className="text-slate-200">{fmt(partsSum)}</span>
        </div>
        <div className="border-t border-bdr my-2" />
        <div className="flex justify-between text-sm font-bold">
          <span className="text-white">Estimated Total</span>
          <span className="text-accent text-lg">{fmt(laborSum + partsSum)}</span>
        </div>
      </div>

      {/* Status Controls */}
      <div>
        <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-3">Update Status</h4>
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLS.map((s) => (
            <Btn
              key={s}
              small
              variant={wo.status === s ? 'primary' : 'secondary'}
              onClick={() => changeStatus(wo.id, s)}
            >
              {s}
            </Btn>
          ))}
        </div>
      </div>

      {/* Generate Invoice — only when Ready for Pickup */}
      {wo.status === 'Ready for Pickup' && (
        <div className="border-t border-bdr pt-5">
          <Btn
            variant="success"
            className="w-full"
            disabled={invoicing}
            onClick={async () => {
              setInvoicing(true);
              await generateInvoice(wo);
              setInvoicing(false);
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <Icon d={icons.file} size={18} />
              {invoicing ? 'Generating Invoice...' : 'Generate Invoice & Complete'}
            </span>
          </Btn>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Creates an invoice from this work order and marks it as completed
          </p>
        </div>
      )}
    </div>
  );
}
