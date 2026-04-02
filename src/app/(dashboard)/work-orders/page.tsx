'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SlideOver } from '@/components/ui/SlideOver';
import { Btn } from '@/components/ui/Btn';
import { PriorityBar } from '@/components/ui/PriorityBar';
import { TH, TD } from '@/components/ui/Table';
import { fmt, printDocument } from '@/lib/utils';
import { NewWOModal } from '@/components/NewWOModal';
import { QuickInspectionModal } from '@/components/QuickInspectionModal';
import { InspectionPanel } from '@/components/InspectionPanel';
import {
  WorkOrder,
  Tech,
  LaborLine,
  PartsLine,
  WOPhoto,
  WOActivity,
  PRIORITY_COLORS,
  type WOStatus,
  type ShopSettings,
  type PartInventory,
  type TimeEntry,
  type PurchaseOrder,
  type Vendor,
  PO_STATUS_LABELS,
} from '@/lib/types';

const KANBAN_COLS: WOStatus[] = ['Unscheduled', 'Scheduled', 'Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup'];
const COL_COLORS: Record<string, string> = {
  'Unscheduled': '#64748b',
  'Scheduled': '#8b5cf6',
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showNewWO, setShowNewWO] = useState(false);
  const [showQuickInspection, setShowQuickInspection] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  // Search & filters
  const [search, setSearch] = useState('');
  const [filterTech, setFilterTech] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  // Bulk selection
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [unscheduledCollapsed, setUnscheduledCollapsed] = useState(true);
  const [scheduledCollapsed, setScheduledCollapsed] = useState(true);

  // Drag-and-drop state
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchWorkOrders = useCallback(async () => {
    const json = await fetch('/api/work-orders').then((r) => r.json());
    const data = Array.isArray(json) ? json : json.data ?? [];
    setWorkOrders(data);
    return data as WorkOrder[];
  }, []);

  // Fetch full WO detail (with all lines) when opening
  const openWO = async (wo: WorkOrder) => {
    setDetailLoading(true);
    setSelectedWO(wo); // show slide-over immediately with basic info
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`);
      const full = await res.json();
      setSelectedWO(full);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetchWorkOrders(),
      fetch('/api/techs').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]).then(([wo, t, s]) => {
      setTechs(t);
      setShopSettings(s);
      setLoaded(true);

      const woParam = searchParams.get('wo');
      const openParam = searchParams.get('open');
      if (openParam) {
        const match = wo.find((w: WorkOrder) => w.id === openParam);
        if (match) openWO(match);
      } else if (woParam) {
        const match = wo.find((w: WorkOrder) => w.display_id === woParam);
        if (match) openWO(match);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredWOs = useMemo(() => {
    return workOrders.filter(w => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          w.display_id?.toLowerCase().includes(q) ||
          w.customer?.name?.toLowerCase().includes(q) ||
          w.job?.toLowerCase().includes(q) ||
          w.vehicle?.make?.toLowerCase().includes(q) ||
          w.vehicle?.model?.toLowerCase().includes(q) ||
          w.vehicle?.plate?.toLowerCase().includes(q) ||
          w.vehicle?.vin?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filterTech && w.tech_id !== filterTech) return false;
      if (filterPriority && w.priority !== filterPriority) return false;
      if (filterStatus && w.status !== filterStatus) return false;
      if (!filterStatus && w.status === 'Completed') return false;
      return true;
    });
  }, [workOrders, search, filterTech, filterPriority, filterStatus]);

  const bulkChangeStatus = async (status: WOStatus) => {
    const ids = Array.from(bulkSelected);
    await Promise.all(ids.map(id =>
      fetch(`/api/work-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    ));
    setBulkSelected(new Set());
    setShowBulkMenu(false);
    await fetchWorkOrders();
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refreshAndSelect = async (woId: string) => {
    await fetchWorkOrders();
    const res = await fetch(`/api/work-orders/${woId}`);
    const full = await res.json();
    setSelectedWO(full);
  };

  const changeStatus = async (woId: string, newStatus: WOStatus) => {
    await fetch(`/api/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await refreshAndSelect(woId);
  };

  // Silent status change for drag-and-drop (doesn't open slide-over)
  const changeStatusSilent = async (woId: string, newStatus: WOStatus) => {
    await fetch(`/api/work-orders/${woId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchWorkOrders();
  };

  // Drag-and-drop handlers
  const handleDragStart = (e: React.DragEvent, wo: WorkOrder) => {
    if (wo.status === 'Completed') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', wo.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(wo.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  };

  const handleDragLeave = (e: React.DragEvent, col: string) => {
    // Only clear if we're actually leaving the column (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      if (dragOverCol === col) setDragOverCol(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: WOStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    setDraggingId(null);
    const woId = e.dataTransfer.getData('text/plain');
    if (!woId) return;
    const wo = workOrders.find(w => w.id === woId);
    if (!wo || wo.status === targetStatus) return;
    await changeStatusSilent(woId, targetStatus);
  };

  const deleteWO = async (woId: string) => {
    const res = await fetch(`/api/work-orders/${woId}`, { method: 'DELETE' });
    if (res.ok) {
      setSelectedWO(null);
      await fetchWorkOrders();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error || 'Failed to delete work order');
    }
  };

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
      const invoice = await res.json();
      await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      setSelectedWO(null);
      router.push(`/invoicing?open=${invoice.id}`);
    }
  };

  if (!loaded) return null;

  return (
    <div>
      {/* Header + Search/Filters */}
      <div className="space-y-3 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-slate-400 text-sm">{filteredWOs.length} of {workOrders.length} work orders</p>
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={() => setShowQuickInspection(true)}>
              <span className="flex items-center gap-2">
                <Icon d={icons.clipboard} size={16} />
                Quick Inspection
              </span>
            </Btn>
            <Btn onClick={() => setShowNewWO(true)}>
              <span className="flex items-center gap-2">
                <Icon d={icons.plus} size={16} />
                New Work Order
              </span>
            </Btn>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Icon d={icons.search} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search WO#, customer, vehicle, job..."
              className="w-full bg-card border border-bdr rounded-lg pl-9 pr-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 font-body"
            />
          </div>
          <select
            value={filterTech}
            onChange={e => setFilterTech(e.target.value)}
            className="bg-card border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
          >
            <option value="">All Techs</option>
            {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="bg-card border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-card border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
          >
            <option value="">All Statuses</option>
            {KANBAN_COLS.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="Completed">Completed</option>
          </select>
        </div>

        {/* Bulk actions bar */}
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-3 bg-accent/10 border border-accent/30 rounded-lg px-4 py-2">
            <span className="text-sm text-accent font-semibold">{bulkSelected.size} selected</span>
            <div className="relative">
              <Btn small onClick={() => setShowBulkMenu(!showBulkMenu)}>
                Change Status
              </Btn>
              {showBulkMenu && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-bdr rounded-lg shadow-xl z-20 py-1 min-w-[180px]">
                  {KANBAN_COLS.map(s => (
                    <button key={s} onClick={() => bulkChangeStatus(s)}
                      className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-surface/50 transition">
                      {s}
                    </button>
                  ))}
                  <button onClick={() => bulkChangeStatus('Completed' as WOStatus)}
                    className="w-full text-left px-4 py-2 text-sm text-success hover:bg-surface/50 transition">
                    Completed
                  </button>
                </div>
              )}
            </div>
            <button onClick={() => setBulkSelected(new Set())} className="text-xs text-slate-500 hover:text-white ml-auto">
              Clear selection
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {/* Collapsible Unscheduled column */}
        {(() => {
          const col = 'Unscheduled' as WOStatus;
          const items = filteredWOs.filter(w => w.status === col);
          return unscheduledCollapsed ? (
            <button
              onClick={() => setUnscheduledCollapsed(false)}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={(e) => handleDragLeave(e, col)}
              onDrop={(e) => handleDrop(e, col)}
              className={`flex-shrink-0 w-10 bg-card border border-bdr rounded-xl p-2 flex flex-col items-center gap-2 hover:border-slate-500 transition ${
                dragOverCol === col ? 'border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(var(--accent-rgb,99,102,241),0.15)]' : ''
              }`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COL_COLORS[col] }} />
              <span className="text-xs text-slate-500 bg-surface px-1.5 py-0.5 rounded-full">{items.length}</span>
              <span className="font-heading font-semibold text-[10px] text-slate-500 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
                Unscheduled
              </span>
            </button>
          ) : (
            <div
              className={`kanban-col flex-1 min-w-0 transition-all ${
                dragOverCol === col ? 'border border-accent/50 bg-accent/5 rounded-xl shadow-[0_0_12px_rgba(var(--accent-rgb,99,102,241),0.15)]' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={(e) => handleDragLeave(e, col)}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: COL_COLORS[col] }} />
                <span className="font-heading font-semibold text-sm text-slate-300 uppercase tracking-wider">
                  Unscheduled
                </span>
                <span className="text-xs text-slate-500 bg-surface px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
                <button
                  onClick={() => setUnscheduledCollapsed(true)}
                  className="ml-auto text-slate-600 hover:text-slate-400 transition"
                  title="Collapse"
                >
                  <Icon d={icons.chevLeft} size={14} />
                </button>
              </div>
              <div className="space-y-3">
                {items.map(w => (
                  <WOCard
                    key={w.id}
                    w={w}
                    openWO={openWO}
                    bulkSelected={bulkSelected}
                    toggleBulkSelect={toggleBulkSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggingId === w.id}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Collapsible Scheduled column */}
        {(() => {
          const col = 'Scheduled' as WOStatus;
          const items = filteredWOs.filter(w => w.status === col);
          return scheduledCollapsed ? (
            <button
              onClick={() => setScheduledCollapsed(false)}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={(e) => handleDragLeave(e, col)}
              onDrop={(e) => handleDrop(e, col)}
              className={`flex-shrink-0 w-10 bg-card border border-bdr rounded-xl p-2 flex flex-col items-center gap-2 hover:border-slate-500 transition ${
                dragOverCol === col ? 'border-accent/50 bg-accent/5 shadow-[0_0_12px_rgba(var(--accent-rgb,99,102,241),0.15)]' : ''
              }`}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COL_COLORS[col] }} />
              <span className="text-xs text-slate-500 bg-surface px-1.5 py-0.5 rounded-full">{items.length}</span>
              <span className="font-heading font-semibold text-[10px] text-slate-500 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">
                Scheduled
              </span>
            </button>
          ) : (
            <div
              className={`kanban-col flex-1 min-w-0 transition-all ${
                dragOverCol === col ? 'border border-accent/50 bg-accent/5 rounded-xl shadow-[0_0_12px_rgba(var(--accent-rgb,99,102,241),0.15)]' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, col)}
              onDragLeave={(e) => handleDragLeave(e, col)}
              onDrop={(e) => handleDrop(e, col)}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: COL_COLORS[col] }} />
                <span className="font-heading font-semibold text-sm text-slate-300 uppercase tracking-wider">
                  Scheduled
                </span>
                <span className="text-xs text-slate-500 bg-surface px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
                <button
                  onClick={() => setScheduledCollapsed(true)}
                  className="ml-auto text-slate-600 hover:text-slate-400 transition"
                  title="Collapse"
                >
                  <Icon d={icons.chevLeft} size={14} />
                </button>
              </div>
              <div className="space-y-3">
                {items.map(w => (
                  <WOCard
                    key={w.id}
                    w={w}
                    openWO={openWO}
                    bulkSelected={bulkSelected}
                    toggleBulkSelect={toggleBulkSelect}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isDragging={draggingId === w.id}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Remaining kanban columns */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
          {KANBAN_COLS.filter(c => c !== 'Unscheduled' && c !== 'Scheduled').map((col) => {
            const items = filteredWOs.filter((w) => w.status === col);
            return (
              <div
                key={col}
                className={`kanban-col transition-all ${
                  dragOverCol === col ? 'border border-accent/50 bg-accent/5 rounded-xl shadow-[0_0_12px_rgba(var(--accent-rgb,99,102,241),0.15)]' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, col)}
                onDragLeave={(e) => handleDragLeave(e, col)}
                onDrop={(e) => handleDrop(e, col as WOStatus)}
              >
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
                  {items.map(w => (
                    <WOCard
                      key={w.id}
                      w={w}
                      openWO={openWO}
                      bulkSelected={bulkSelected}
                      toggleBulkSelect={toggleBulkSelect}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === w.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Work Order Modal */}
      <NewWOModal
        open={showNewWO}
        onClose={() => setShowNewWO(false)}
        techs={techs}
        onCreated={(id) => refreshAndSelect(id)}
        defaultLaborRate={shopSettings?.default_labor_rate ? Number(shopSettings.default_labor_rate) : 125}
      />

      {/* Quick Inspection Modal */}
      <QuickInspectionModal
        open={showQuickInspection}
        onClose={() => setShowQuickInspection(false)}
        onCreated={async (woId) => {
          const wos = await fetchWorkOrders();
          const newWO = wos.find((w: WorkOrder) => w.id === woId);
          if (newWO) openWO(newWO);
        }}
      />

      {/* Repair Order Detail — MaxxTraxx-style */}
      <SlideOver
        open={!!selectedWO}
        onClose={() => setSelectedWO(null)}
        title={selectedWO ? `Repair Order ${selectedWO.display_id}` : ''}
        wide
      >
        {selectedWO && (
          <RODetail
            key={selectedWO.id + '-' + (selectedWO.labor_lines?.length ?? 0)}
            wo={selectedWO}
            techs={techs}
            changeStatus={changeStatus}
            generateInvoice={generateInvoice}
            deleteWO={deleteWO}
            onSave={() => refreshAndSelect(selectedWO.id)}
            defaultLaborRate={shopSettings?.default_labor_rate ? Number(shopSettings.default_labor_rate) : 125}
            shopSettings={shopSettings}
          />
        )}
      </SlideOver>
    </div>
  );
}

/* ===================== WORK ORDER KANBAN CARD ===================== */

function WOCard({
  w,
  openWO,
  bulkSelected,
  toggleBulkSelect,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  w: WorkOrder;
  openWO: (wo: WorkOrder) => void;
  bulkSelected: Set<string>;
  toggleBulkSelect: (id: string) => void;
  onDragStart?: (e: React.DragEvent, wo: WorkOrder) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const didDrag = useRef(false);
  const vehicleStr = w.vehicle
    ? `${w.vehicle.year || ''} ${w.vehicle.make} ${w.vehicle.model}`
    : '';
  const isCompleted = w.status === 'Completed';
  return (
    <div
      draggable={!isCompleted}
      onDragStart={(e) => {
        didDrag.current = false;
        onDragStart?.(e, w);
      }}
      onDrag={() => { didDrag.current = true; }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
      onClick={() => {
        if (!didDrag.current) openWO(w);
        didDrag.current = false;
      }}
      className={`relative bg-card border border-bdr rounded-xl p-4 pl-5 cursor-pointer hover:border-slate-500 transition group ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <PriorityBar priority={w.priority} />
      <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={bulkSelected.has(w.id)}
          onChange={() => toggleBulkSelect(w.id)}
          className="w-3.5 h-3.5 rounded border-slate-600 text-accent focus:ring-accent/50 bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 transition"
          style={bulkSelected.has(w.id) ? { opacity: 1 } : {}}
        />
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-accent text-xs font-bold font-heading">{w.display_id}</span>
        <span className="text-[11px] text-slate-500">{w.labor_hours || 0}h</span>
      </div>
      <div className="text-sm text-slate-200 font-medium mb-1">{vehicleStr}</div>
      <div className="text-xs text-slate-400 mb-1">{w.job}</div>
      {w.status === 'Scheduled' && w.scheduled_date && (
        <div className="flex items-center gap-1 text-[11px] text-purple-400 mb-2">
          <Icon d={icons.calendar} size={11} />
          {new Date(w.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
      {w.status !== 'Scheduled' && <div className="mb-2" />}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {w.tech && (
            <>
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{ background: w.tech.color + '25', color: w.tech.color }}
              >
                {w.tech.name.split(' ').map((n) => n[0]).join('')}
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
}

/* ===================== REPAIR ORDER DETAIL (MaxxTraxx-style) ===================== */

function RODetail({
  wo,
  techs,
  changeStatus,
  generateInvoice,
  deleteWO,
  onSave,
  defaultLaborRate = 125,
  shopSettings,
}: {
  wo: WorkOrder;
  techs: Tech[];
  changeStatus: (id: string, status: WOStatus) => void;
  generateInvoice: (wo: WorkOrder) => void;
  deleteWO: (id: string) => void;
  onSave: () => void;
  defaultLaborRate?: number;
  shopSettings: ShopSettings | null;
}) {
  const [invoicing, setInvoicing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Editable fields
  const [job, setJob] = useState(wo.job);
  const [notes, setNotes] = useState(wo.notes || '');
  const [techId, setTechId] = useState(wo.tech_id || '');
  const [priority, setPriority] = useState(wo.priority);
  const [mileageIn, setMileageIn] = useState(wo.mileage_in?.toString() || wo.vehicle?.mileage?.toString() || '');
  const [mileageOut, setMileageOut] = useState(wo.mileage_out?.toString() || '');

  // Labor lines
  const [laborLines, setLaborLines] = useState<LaborLine[]>(
    wo.labor_lines?.length ? wo.labor_lines : []
  );

  // Parts lines
  const [partsLines, setPartsLines] = useState<PartsLine[]>(
    wo.parts_lines?.length ? wo.parts_lines : []
  );

  // Add labor form
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [newLaborDesc, setNewLaborDesc] = useState('');
  const [newLaborHours, setNewLaborHours] = useState('1');
  const [newLaborRate, setNewLaborRate] = useState(String(defaultLaborRate));

  // Add part form
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartQty, setNewPartQty] = useState('1');
  const [newPartPrice, setNewPartPrice] = useState('');

  // Inventory search state
  const [invSearchResults, setInvSearchResults] = useState<PartInventory[]>([]);
  const [showInvDropdown, setShowInvDropdown] = useState(false);
  const [selectedFromInventory, setSelectedFromInventory] = useState(false);
  const invSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invDropdownRef = useRef<HTMLDivElement>(null);

  // PartsTech search state
  const [partSource, setPartSource] = useState<'inventory' | 'partstech'>('inventory');
  const [ptResults, setPtResults] = useState<{ part_number: string; name: string; brand: string; price: number; list_price: number; availability: string; eta: string | null }[]>([]);
  const [ptSearching, setPtSearching] = useState(false);
  const [showPtDropdown, setShowPtDropdown] = useState(false);
  const [selectedPtPart, setSelectedPtPart] = useState<{ part_number: string; brand: string } | null>(null);
  const ptSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectionRef = useRef<HTMLDivElement>(null);
  const ptConfigured = !!(shopSettings?.partstech_username && shopSettings?.partstech_api_key);

  // Photos
  const [photos, setPhotos] = useState<WOPhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  // Activity log
  const [activityLog, setActivityLog] = useState<WOActivity[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Time tracking
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeTick, setTimeTick] = useState(0);

  // Schedule date picker for unscheduled WOs
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduling, setScheduling] = useState(false);

  // Purchase Orders linked to this WO
  const [linkedPOs, setLinkedPOs] = useState<PurchaseOrder[]>([]);
  const [woPOLoaded, setWoPOLoaded] = useState(false);
  const [creatingPO, setCreatingPO] = useState(false);

  // Computed totals
  const laborSum = useMemo(() => laborLines.reduce((s, l) => s + l.hours * l.rate, 0), [laborLines]);
  const partsSum = useMemo(() => partsLines.reduce((s, p) => s + p.qty * p.price, 0), [partsLines]);
  const totalHours = useMemo(() => laborLines.reduce((s, l) => s + l.hours, 0), [laborLines]);

  const vehicleStr = wo.vehicle
    ? `${wo.vehicle.year || ''} ${wo.vehicle.make} ${wo.vehicle.model}`
    : '';

  const createdDate = wo.created_at
    ? new Date(wo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // Mark dirty on any change
  const markDirty = () => setDirty(true);

  // Add labor line
  const addLabor = () => {
    if (!newLaborDesc.trim()) return;
    setLaborLines(prev => [...prev, {
      description: newLaborDesc,
      hours: parseFloat(newLaborHours) || 1,
      rate: parseFloat(newLaborRate) || defaultLaborRate,
    }]);
    setNewLaborDesc('');
    setNewLaborHours('1');
    setNewLaborRate(String(defaultLaborRate));
    setShowAddLabor(false);
    markDirty();
  };

  // Remove labor line
  const removeLabor = (idx: number) => {
    setLaborLines(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  // Inventory search handler
  const handlePartSearch = (q: string) => {
    setNewPartName(q);
    setSelectedFromInventory(false);
    if (invSearchTimer.current) clearTimeout(invSearchTimer.current);
    if (!q.trim()) {
      setInvSearchResults([]);
      setShowInvDropdown(false);
      return;
    }
    invSearchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/parts-inventory?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setInvSearchResults(data);
          setShowInvDropdown(data.length > 0);
        }
      } catch {
        setInvSearchResults([]);
        setShowInvDropdown(false);
      }
    }, 250);
  };

  const selectInventoryPart = (part: PartInventory) => {
    setNewPartName(part.name);
    setNewPartPrice(String(part.price));
    setSelectedFromInventory(true);
    setShowInvDropdown(false);
    setInvSearchResults([]);
  };

  // PartsTech search handler
  const handlePtSearch = (value: string) => {
    setNewPartName(value);
    setSelectedPtPart(null);
    if (ptSearchTimer.current) clearTimeout(ptSearchTimer.current);
    if (value.trim().length < 2) { setPtResults([]); setShowPtDropdown(false); return; }
    ptSearchTimer.current = setTimeout(async () => {
      setPtSearching(true);
      try {
        const vehicle = wo?.vehicle ? { year: wo.vehicle.year, make: wo.vehicle.make, model: wo.vehicle.model } : undefined;
        const res = await fetch('/api/partstech/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value, vehicle }),
        });
        const data = await res.json();
        setPtResults(data.results || []);
        setShowPtDropdown(true);
      } catch {
        setPtResults([]);
        setShowPtDropdown(false);
      }
      setPtSearching(false);
    }, 400);
  };

  const selectPtPart = (part: typeof ptResults[0]) => {
    setNewPartName(part.name);
    setNewPartPrice(String(part.price));
    setSelectedPtPart({ part_number: part.part_number, brand: part.brand });
    setShowPtDropdown(false);
    setPtResults([]);
  };

  // Add part line
  const addPart = () => {
    if (!newPartName.trim()) return;
    const source = selectedPtPart ? 'partstech' : selectedFromInventory ? 'inventory' : 'manual';
    setPartsLines(prev => [...prev, {
      name: newPartName,
      qty: parseInt(newPartQty) || 1,
      price: parseFloat(newPartPrice) || 0,
      source,
      part_number: selectedPtPart?.part_number || undefined,
      brand: selectedPtPart?.brand || undefined,
    }]);
    setNewPartName('');
    setNewPartQty('1');
    setNewPartPrice('');
    setSelectedFromInventory(false);
    setSelectedPtPart(null);
    setShowAddPart(false);
    setPartSource('inventory');
    markDirty();
  };

  // Remove part line
  const removePart = (idx: number) => {
    setPartsLines(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  // Save RO (like MaxxTraxx OK/Save)
  const saveRO = async () => {
    setSaving(true);
    await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job,
        notes: notes || null,
        tech_id: techId || null,
        priority,
        mileage_in: mileageIn ? parseInt(mileageIn) : null,
        mileage_out: mileageOut ? parseInt(mileageOut) : null,
        labor_lines: laborLines.map(l => ({
          description: l.description,
          hours: l.hours,
          rate: l.rate,
        })),
        parts_lines: partsLines.map(p => ({
          name: p.name,
          qty: p.qty,
          price: p.price,
          source: p.source || 'manual',
          part_number: p.part_number || null,
          brand: p.brand || null,
        })),
      }),
    });
    setDirty(false);
    setSaving(false);
    onSave();
  };

  const scheduleWO = async () => {
    if (!scheduleDate) return;
    setScheduling(true);
    await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Scheduled', scheduled_date: scheduleDate }),
    });
    setScheduling(false);
    setScheduleDate('');
    onSave();
  };

  // Fetch photos on mount
  useEffect(() => {
    fetch(`/api/work-orders/${wo.id}/photos`).then(r => r.json()).then(d => { if (Array.isArray(d)) setPhotos(d); });
  }, [wo.id]);

  // Fetch activity log
  useEffect(() => {
    fetch(`/api/work-orders/${wo.id}/activity`).then(r => r.json()).then(d => { if (Array.isArray(d)) setActivityLog(d); });
  }, [wo.id]);

  // Fetch time entries for this WO
  useEffect(() => {
    fetch(`/api/work-orders/${wo.id}/time`).then(r => r.json()).then(d => { if (Array.isArray(d)) setTimeEntries(d); });
  }, [wo.id]);

  // Fetch linked purchase orders
  useEffect(() => {
    fetch(`/api/work-orders/${wo.id}/purchase-orders`).then(r => r.json()).then(d => { if (Array.isArray(d)) setLinkedPOs(d); setWoPOLoaded(true); });
  }, [wo.id]);

  const createPOFromParts = async () => {
    if (partsLines.length === 0) return;
    setCreatingPO(true);
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        work_order_id: wo.id,
        lines: partsLines.map(p => ({
          name: p.name,
          part_number: p.part_number || null,
          qty_ordered: p.qty,
          unit_cost: 0,
          wo_parts_line_id: p.id || null,
        })),
      }),
    });
    if (res.ok) {
      const po = await res.json();
      setLinkedPOs(prev => [po, ...prev]);
    }
    setCreatingPO(false);
  };

  // Tick timer for active job timers
  useEffect(() => {
    const hasActive = timeEntries.some(e => !e.clock_out);
    if (!hasActive) return;
    const timer = setInterval(() => setTimeTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, [timeEntries]);

  const startJobTimer = async () => {
    if (!wo.tech_id) return;
    const res = await fetch('/api/time-clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech_id: wo.tech_id, type: 'job', work_order_id: wo.id }),
    });
    if (res.ok) {
      const entry = await res.json();
      setTimeEntries(prev => [entry, ...prev]);
    }
  };

  const stopJobTimer = async (entryId: string) => {
    const res = await fetch(`/api/time-clock/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clock_out: new Date().toISOString() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTimeEntries(prev => prev.map(e => e.id === entryId ? updated : e));
    }
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/work-orders/${wo.id}/photos`, { method: 'POST', body: fd });
    if (res.ok) {
      const updated = await fetch(`/api/work-orders/${wo.id}/photos`).then(r => r.json());
      if (Array.isArray(updated)) setPhotos(updated);
    }
    setUploading(false);
  };

  const isCompleted = wo.status === 'Completed';

  return (
    <div className="space-y-5">
      {/* Quick Nav */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => inspectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="flex items-center gap-1.5 text-xs font-heading font-semibold bg-surface border border-bdr rounded-lg px-3 py-1.5 text-slate-400 hover:text-white hover:border-accent/30 transition"
        >
          <Icon d={icons.clipboard} size={12} />
          Inspection
        </button>
      </div>

      {/* RO Header Info — Complaint section (MaxxTraxx Reason for Service) */}
      <div className="bg-bg rounded-xl border border-bdr p-4">
        <div className="flex items-center gap-3 mb-3">
          <StatusBadge status={wo.status} />
          {wo.status === 'Scheduled' && wo.scheduled_date ? (
            <span className="flex items-center gap-1 text-xs text-purple-400">
              <Icon d={icons.calendar} size={12} />
              {new Date(wo.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          ) : (
            <span className="text-xs text-slate-500">{createdDate}</span>
          )}
          <span className="text-xs text-slate-500 ml-auto">{totalHours}h total labor</span>
        </div>

        {wo.status === 'Unscheduled' && (
          <div className="bg-surface/50 border border-bdr rounded-lg p-3 mb-3">
            <div className="text-[10px] font-heading text-slate-500 uppercase tracking-wider mb-2">Schedule this work order</div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="flex-1 bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
              />
              <Btn small onClick={scheduleWO} disabled={!scheduleDate || scheduling}>
                <span className="flex items-center gap-1.5">
                  <Icon d={icons.calendar} size={13} />
                  {scheduling ? 'Scheduling...' : 'Schedule'}
                </span>
              </Btn>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Customer */}
          <div>
            <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Customer</div>
            {wo.customer_id ? (
              <Link href={`/customers?open=${wo.customer_id}`} className="text-sm text-accent hover:text-orange-400 font-medium transition">{wo.customer?.name}</Link>
            ) : (
              <div className="text-sm text-white font-medium">{wo.customer?.name}</div>
            )}
            {wo.customer?.phone && <div className="text-xs text-slate-500">{wo.customer.phone}</div>}
          </div>
          {/* Vehicle */}
          <div>
            <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Vehicle</div>
            {wo.customer_id ? (
              <Link href={`/customers?open=${wo.customer_id}`} className="text-sm text-accent hover:text-orange-400 font-medium transition">{vehicleStr}</Link>
            ) : (
              <div className="text-sm text-white font-medium">{vehicleStr}</div>
            )}
            {wo.vehicle?.vin && <div className="text-xs text-slate-500">VIN: {wo.vehicle.vin}</div>}
            {wo.vehicle?.plate && <div className="text-xs text-slate-500">Plate: {wo.vehicle.plate}</div>}
          </div>
        </div>
      </div>

      {/* Mileage In/Out — MaxxTraxx-style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Mileage In</label>
          <input
            type="number"
            value={mileageIn}
            onChange={(e) => { setMileageIn(e.target.value); markDirty(); }}
            disabled={isCompleted}
            className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body disabled:opacity-40"
            placeholder="Odometer reading"
          />
        </div>
        <div>
          <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Mileage Out</label>
          <input
            type="number"
            value={mileageOut}
            onChange={(e) => { setMileageOut(e.target.value); markDirty(); }}
            disabled={isCompleted}
            className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body disabled:opacity-40"
            placeholder="Odometer reading"
          />
        </div>
      </div>

      {/* Reason for Service / Job Description — Editable */}
      <div>
        <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">
          Reason for Service
        </label>
        <textarea
          rows={2}
          value={job}
          onChange={(e) => { setJob(e.target.value); markDirty(); }}
          disabled={isCompleted}
          className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body resize-none disabled:opacity-40"
        />
      </div>

      {/* Tech + Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Technician</label>
          <select
            value={techId}
            onChange={(e) => { setTechId(e.target.value); markDirty(); }}
            disabled={isCompleted}
            className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body disabled:opacity-40"
          >
            <option value="">Unassigned</option>
            {techs.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => { setPriority(e.target.value as 'low' | 'medium' | 'high'); markDirty(); }}
            disabled={isCompleted}
            className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body disabled:opacity-40"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {/* ========== LABOR OPERATIONS — MaxxTraxx Add Labors ========== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">
            Labor Operations
          </h4>
          {!isCompleted && (
            <button
              onClick={() => setShowAddLabor(!showAddLabor)}
              className="text-accent hover:text-orange-400 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1"
            >
              <Icon d={icons.plus} size={12} />
              Add Labor
            </button>
          )}
        </div>

        {/* Add labor form */}
        {showAddLabor && (
          <div className="bg-bg border border-accent/30 rounded-lg p-3 mb-3 space-y-2">
            <input
              value={newLaborDesc}
              onChange={(e) => setNewLaborDesc(e.target.value)}
              className="w-full bg-card border border-bdr rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
              placeholder="Labor description (e.g. Brake pad replacement - front)"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-600 uppercase">Hours</label>
                <input
                  type="number"
                  step="0.1"
                  value={newLaborHours}
                  onChange={(e) => setNewLaborHours(e.target.value)}
                  className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-600 uppercase">Rate/hr</label>
                <input
                  type="number"
                  step="0.01"
                  value={newLaborRate}
                  onChange={(e) => setNewLaborRate(e.target.value)}
                  className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                />
              </div>
              <div className="flex items-end gap-2">
                <Btn small onClick={addLabor}>Add</Btn>
                <Btn small variant="secondary" onClick={() => setShowAddLabor(false)}>Cancel</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Labor lines table */}
        {laborLines.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-bdr">
                <TH>Description</TH>
                <TH className="text-right">Hours</TH>
                <TH className="text-right">Rate</TH>
                <TH className="text-right">Total</TH>
                {!isCompleted && <TH className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-bdr/50">
              {laborLines.map((l, i) => (
                <tr key={i} className="group">
                  <TD className="text-slate-300 text-xs">{l.description}</TD>
                  <TD className="text-right text-slate-400 text-xs">{l.hours}</TD>
                  <TD className="text-right text-slate-400 text-xs">{fmt(l.rate)}</TD>
                  <TD className="text-right text-white font-medium text-xs">{fmt(l.hours * l.rate)}</TD>
                  {!isCompleted && (
                    <TD className="text-right">
                      <button
                        onClick={() => removeLabor(i)}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-error transition"
                      >
                        <Icon d={icons.x} size={12} />
                      </button>
                    </TD>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-xs text-slate-600 bg-bg rounded-lg p-3 border border-bdr text-center">
            No labor operations. Click &quot;Add Labor&quot; to add a service.
          </div>
        )}
        {laborLines.length > 0 && (
          <div className="text-right text-xs text-slate-500 mt-1.5">
            Labor: <span className="text-slate-300 font-semibold">{fmt(laborSum)}</span>
            <span className="text-slate-600 ml-2">({totalHours}h)</span>
          </div>
        )}
      </div>

      {/* ========== PARTS — MaxxTraxx Add Parts ========== */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">
            Parts
          </h4>
          <div className="flex items-center gap-3">
            {!isCompleted && partsLines.length > 0 && (
              <button
                onClick={createPOFromParts}
                disabled={creatingPO}
                className="text-blue-400 hover:text-blue-300 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Icon d={icons.truck} size={12} />
                {creatingPO ? 'Creating...' : 'Order Parts'}
              </button>
            )}
            {!isCompleted && (
              <button
                onClick={() => setShowAddPart(!showAddPart)}
                className="text-accent hover:text-orange-400 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Icon d={icons.plus} size={12} />
                Add Part
              </button>
            )}
          </div>
        </div>

        {/* Add part form — with inventory + PartsTech search */}
        {showAddPart && (
          <div className="bg-bg border border-accent/30 rounded-lg p-3 mb-3 space-y-2">
            {/* Source tabs */}
            {ptConfigured && (
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => { setPartSource('inventory'); setPtResults([]); setShowPtDropdown(false); setSelectedPtPart(null); }}
                  className={`text-[10px] font-heading font-bold uppercase tracking-wider px-2.5 py-1 rounded transition ${partSource === 'inventory' ? 'bg-accent/15 text-accent border border-accent/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                >
                  Inventory
                </button>
                <button
                  onClick={() => { setPartSource('partstech'); setInvSearchResults([]); setShowInvDropdown(false); setSelectedFromInventory(false); }}
                  className={`text-[10px] font-heading font-bold uppercase tracking-wider px-2.5 py-1 rounded transition ${partSource === 'partstech' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
                >
                  PartsTech
                </button>
              </div>
            )}

            <div className="relative" ref={invDropdownRef}>
              <input
                value={newPartName}
                onChange={(e) => partSource === 'partstech' ? handlePtSearch(e.target.value) : handlePartSearch(e.target.value)}
                onFocus={() => {
                  if (partSource === 'inventory' && invSearchResults.length > 0 && !selectedFromInventory) setShowInvDropdown(true);
                  if (partSource === 'partstech' && ptResults.length > 0 && !selectedPtPart) setShowPtDropdown(true);
                }}
                className="w-full bg-card border border-bdr rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                placeholder={partSource === 'partstech' ? 'Search PartsTech catalog...' : 'Search inventory or type part name...'}
                autoFocus
              />
              {ptSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">Searching...</span>
              )}
              {(selectedFromInventory || selectedPtPart) && !ptSearching && (
                <button
                  onClick={() => { setSelectedFromInventory(false); setSelectedPtPart(null); setNewPartName(''); setNewPartPrice(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <Icon d={icons.x} size={14} />
                </button>
              )}

              {/* Inventory dropdown */}
              {partSource === 'inventory' && showInvDropdown && invSearchResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {invSearchResults.map((inv) => (
                    <button
                      key={inv.id}
                      onClick={() => selectInventoryPart(inv)}
                      className="w-full px-3 py-2.5 text-left hover:bg-surface/50 transition flex items-center justify-between"
                    >
                      <div>
                        <div className="text-sm text-white">{inv.name}</div>
                        <div className="text-xs text-slate-500">
                          {inv.part_number && <span className="font-mono mr-2">{inv.part_number}</span>}
                          {fmt(inv.price)}
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${inv.qty_on_hand <= inv.min_stock ? 'text-error' : 'text-slate-400'}`}>
                        {inv.qty_on_hand} in stock
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* PartsTech dropdown */}
              {partSource === 'partstech' && showPtDropdown && ptResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {ptResults.map((pt) => (
                    <button
                      key={pt.part_number}
                      onClick={() => selectPtPart(pt)}
                      className="w-full px-3 py-2.5 text-left hover:bg-surface/50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{pt.name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-mono">{pt.part_number}</span>
                            <span className="text-slate-600">|</span>
                            <span>{pt.brand}</span>
                          </div>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <div className="text-sm font-medium text-white">{fmt(pt.price)}</div>
                          <span className={`text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-px rounded ${
                            pt.availability === 'in_stock' ? 'bg-success/10 text-success' :
                            pt.availability === 'special_order' ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-error/10 text-error'
                          }`}>
                            {pt.availability === 'in_stock' ? 'In Stock' : pt.availability === 'special_order' ? pt.eta || 'Special Order' : 'Unavailable'}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source badge */}
            {selectedFromInventory && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-heading font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                  from inventory
                </span>
              </div>
            )}
            {selectedPtPart && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-heading font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  PartsTech
                </span>
                <span className="text-[10px] font-mono text-slate-500">{selectedPtPart.part_number}</span>
                <span className="text-[10px] text-slate-600">{selectedPtPart.brand}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-600 uppercase">Qty</label>
                <input
                  type="number"
                  value={newPartQty}
                  onChange={(e) => setNewPartQty(e.target.value)}
                  className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-600 uppercase">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPartPrice}
                  onChange={(e) => setNewPartPrice(e.target.value)}
                  className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                  placeholder="0.00"
                />
              </div>
              <div className="flex items-end gap-2">
                <Btn small onClick={addPart}>Add</Btn>
                <Btn small variant="secondary" onClick={() => { setShowAddPart(false); setShowInvDropdown(false); setSelectedFromInventory(false); setShowPtDropdown(false); setSelectedPtPart(null); setPartSource('inventory'); }}>Cancel</Btn>
              </div>
            </div>
          </div>
        )}

        {/* Parts lines table */}
        {partsLines.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-bdr">
                <TH>Part</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Total</TH>
                {!isCompleted && <TH className="w-8" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-bdr/50">
              {partsLines.map((p, i) => (
                <tr key={i} className="group">
                  <TD className="text-slate-300 text-xs">
                    <div className="flex items-center gap-1.5">
                      {p.name}
                      {p.source === 'inventory' && (
                        <span className="text-[9px] font-heading font-semibold uppercase tracking-wider px-1 py-px rounded bg-accent/10 text-accent border border-accent/20">inv</span>
                      )}
                      {p.source === 'partstech' && (
                        <span className="text-[9px] font-heading font-semibold uppercase tracking-wider px-1 py-px rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">PT</span>
                      )}
                    </div>
                    {p.part_number && (
                      <div className="text-[10px] font-mono text-slate-600 mt-0.5">{p.part_number}{p.brand ? ` · ${p.brand}` : ''}</div>
                    )}
                  </TD>
                  <TD className="text-right text-slate-400 text-xs">{p.qty}</TD>
                  <TD className="text-right text-slate-400 text-xs">{fmt(p.price)}</TD>
                  <TD className="text-right text-white font-medium text-xs">{fmt(p.qty * p.price)}</TD>
                  {!isCompleted && (
                    <TD className="text-right">
                      <button
                        onClick={() => removePart(i)}
                        className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-error transition"
                      >
                        <Icon d={icons.x} size={12} />
                      </button>
                    </TD>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-xs text-slate-600 bg-bg rounded-lg p-3 border border-bdr text-center">
            No parts added. Click &quot;Add Part&quot; to add parts.
          </div>
        )}
        {partsLines.length > 0 && (
          <div className="text-right text-xs text-slate-500 mt-1.5">
            Parts: <span className="text-slate-300 font-semibold">{fmt(partsSum)}</span>
          </div>
        )}

        {/* Linked Purchase Orders */}
        {woPOLoaded && linkedPOs.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bdr/50">
            <h5 className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Icon d={icons.truck} size={11} stroke="#64748b" />
              Purchase Orders ({linkedPOs.length})
            </h5>
            <div className="space-y-1.5">
              {linkedPOs.map(po => {
                const totalCost = (po.lines || []).reduce((s: number, l: { qty_ordered: number; unit_cost: number }) => s + l.qty_ordered * Number(l.unit_cost), 0);
                const allReceived = (po.lines || []).length > 0 && (po.lines || []).every((l: { qty_received: number; qty_ordered: number }) => l.qty_received >= l.qty_ordered);
                const anyReceived = (po.lines || []).some((l: { qty_received: number }) => l.qty_received > 0);
                return (
                  <div key={po.id} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 border border-bdr">
                    <div className="flex items-center gap-2">
                      <Link href={`/purchase-orders?open=${po.id}`} className="text-xs font-heading font-bold text-blue-400 hover:text-blue-300 transition">{po.display_id}</Link>
                      {po.vendor && (
                        <span className="text-[10px] text-slate-500">{(po.vendor as Vendor).name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {totalCost > 0 && (
                        <span className="text-[10px] text-slate-400">{fmt(totalCost)}</span>
                      )}
                      <span className={`text-[9px] font-heading font-bold uppercase tracking-wider px-1.5 py-px rounded ${
                        po.status === 'received' || allReceived ? 'bg-success/10 text-success' :
                        po.status === 'cancelled' ? 'bg-error/10 text-error' :
                        anyReceived || po.status === 'partially_received' ? 'bg-yellow-500/10 text-yellow-400' :
                        po.status === 'ordered' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {PO_STATUS_LABELS[po.status]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Notes — MaxxTraxx Repair Order Notes */}
      <div>
        <label className="block text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-1">
          Service Notes
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => { setNotes(e.target.value); markDirty(); }}
          disabled={isCompleted}
          className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body resize-none disabled:opacity-40"
          placeholder="Technician notes, customer requests, observations..."
        />
      </div>

      {/* ========== PHOTOS ========== */}
      <div className="bg-bg rounded-xl border border-bdr p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-[10px] font-heading text-slate-600 uppercase tracking-wider font-bold">
            Photos
          </label>
          {!isCompleted && (
            <label className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer">
              <Icon d={icons.camera} size={12} />
              {uploading ? 'Uploading...' : 'Add Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                if (e.target.files?.[0]) uploadPhoto(e.target.files[0]);
              }} />
            </label>
          )}
        </div>
        {photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {photos.map(p => (
              <div key={p.id} className="relative group">
                <img src={p.url} alt={p.caption || 'WO Photo'} className="w-full h-24 object-cover rounded-lg border border-bdr" />
                {!isCompleted && (
                  <button onClick={async () => {
                    await fetch(`/api/work-orders/${wo.id}/photos`, {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ photo_id: p.id }),
                    });
                    setPhotos(prev => prev.filter(x => x.id !== p.id));
                  }} className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition text-white hover:text-error">
                    <Icon d={icons.x} size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-600">No photos attached.</div>
        )}
      </div>

      {/* ========== DIGITAL VEHICLE INSPECTION ========== */}
      <div ref={inspectionRef}>
        <InspectionPanel workOrderId={wo.id} />
      </div>

      {/* ========== TIME TRACKING ========== */}
      <div className="border-t border-bdr pt-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[10px] font-heading text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Icon d={icons.clock} size={12} stroke="#64748b" />
            Time Tracking
          </h4>
          {wo.tech_id && !timeEntries.some(e => !e.clock_out) && !isCompleted && (
            <button
              onClick={startJobTimer}
              className="text-xs text-accent hover:text-orange-400 font-heading font-semibold uppercase tracking-wider"
            >
              Start Timer
            </button>
          )}
        </div>

        {/* Active timer */}
        {timeEntries.filter(e => !e.clock_out).map(entry => {
          const ms = Date.now() - new Date(entry.clock_in).getTime();
          const h = Math.floor(ms / 3600000);
          const m = Math.floor((ms % 3600000) / 60000);
          return (
            <div key={entry.id} className="bg-green-500/5 border border-green-500/20 rounded-lg px-3 py-2.5 mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-slate-300">{entry.tech?.name || 'Tech'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-heading font-bold text-green-400" key={timeTick}>
                  {h}h {m.toString().padStart(2, '0')}m
                </span>
                <button
                  onClick={() => stopJobTimer(entry.id)}
                  className="text-xs text-red-400 hover:text-red-300 font-heading font-semibold uppercase"
                >
                  Stop
                </button>
              </div>
            </div>
          );
        })}

        {/* Completed entries */}
        {timeEntries.filter(e => e.clock_out).length > 0 && (
          <div className="space-y-1.5">
            {timeEntries.filter(e => e.clock_out).map(entry => {
              const h = entry.duration_minutes ? Math.floor(entry.duration_minutes / 60) : 0;
              const m = entry.duration_minutes ? entry.duration_minutes % 60 : 0;
              return (
                <div key={entry.id} className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span style={{ color: entry.tech?.color }}>{entry.tech?.name?.split(' ')[0]}</span>
                    <span className="text-slate-600">
                      {new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {' — '}
                      {new Date(entry.clock_out!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <span className="text-slate-300 font-heading font-bold">{h}h {m.toString().padStart(2, '0')}m</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actual vs Billed comparison */}
        {timeEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-bdr flex items-center justify-between">
            <div className="text-xs text-slate-500">
              <span className="font-heading font-semibold">Actual:</span>{' '}
              {(() => {
                const totalMin = timeEntries.reduce((sum, e) => {
                  if (e.clock_out) return sum + (e.duration_minutes || 0);
                  return sum + Math.round((Date.now() - new Date(e.clock_in).getTime()) / 60000);
                }, 0);
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                return `${h}h ${m.toString().padStart(2, '0')}m`;
              })()}
            </div>
            <div className="text-xs text-slate-500">
              <span className="font-heading font-semibold">Billed:</span>{' '}
              {totalHours}h
            </div>
          </div>
        )}

        {timeEntries.length === 0 && !isCompleted && wo.tech_id && (
          <p className="text-xs text-slate-600">No time entries yet. Start a timer to track job time.</p>
        )}
        {!wo.tech_id && !isCompleted && (
          <p className="text-xs text-slate-600">Assign a tech to enable time tracking.</p>
        )}
      </div>

      {/* ========== TOTALS — MaxxTraxx RO Summary ========== */}
      <div className="bg-bg rounded-xl p-4 border border-bdr">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-500">Labor ({totalHours}h)</span>
          <span className="text-slate-300">{fmt(laborSum)}</span>
        </div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-500">Parts ({partsLines.length} items)</span>
          <span className="text-slate-300">{fmt(partsSum)}</span>
        </div>
        <div className="border-t border-bdr my-2" />
        <div className="flex justify-between font-bold">
          <span className="text-white">Estimated Total</span>
          <span className="text-accent text-xl">{fmt(laborSum + partsSum)}</span>
        </div>
      </div>

      {/* Print Work Order */}
      <Btn variant="secondary" onClick={() => {
        const s = shopSettings;
        printDocument({
          title: wo.display_id,
          docNumber: wo.display_id,
          docLabel: 'Work Order',
          docDate: new Date(wo.created_at).toLocaleDateString(),
          shopName: s?.shop_name || 'ShopForge',
          shopAddress: s?.address || '',
          shopPhone: s?.phone || '',
          shopEmail: s?.email || '',
          customerName: wo.customer?.name || '',
          vehicleStr,
          laborLines,
          partsLines,
          laborTotal: laborSum,
          partsTotal: partsSum,
          grandTotal: laborSum + partsSum,
          notes: notes || wo.notes,
          footer: s?.invoice_footer || 'Thank you for your business!',
          extraInfo: `Status: ${wo.status}` + (wo.tech?.name ? ` · Tech: ${wo.tech.name}` : ''),
          logoUrl: s?.logo_url,
        });
      }}>
        <span className="flex items-center gap-2"><Icon d={icons.print} size={16} />Print Work Order</span>
      </Btn>

      {/* ========== ACTION BUTTONS — MaxxTraxx OK/Save workflow ========== */}
      {!isCompleted && (
        <div className="space-y-3">
          {/* Save button */}
          <Btn
            className="w-full"
            onClick={saveRO}
            disabled={saving}
          >
            <span className="flex items-center justify-center gap-2">
              <Icon d={icons.check} size={16} />
              {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Save Repair Order'}
            </span>
          </Btn>

          {/* Status Controls — MaxxTraxx Change Status */}
          <div>
            <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-2">Change Status</div>
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

          {/* Complete & Generate Invoice — MaxxTraxx Complete/Pay flow */}
          {wo.status === 'Ready for Pickup' && (
            <div className="border-t border-bdr pt-4">
              <div className="bg-success/5 border border-success/20 rounded-xl p-4">
                <h4 className="font-heading font-bold text-sm text-success uppercase tracking-wider mb-2">
                  Complete Repair Order
                </h4>
                <p className="text-xs text-slate-500 mb-3">
                  This will finalize the repair order, create an invoice, and mark the RO as completed.
                  Like MaxxTraxx&apos;s &quot;Close &amp; Pay&quot; — the invoice can be paid from the Invoicing page.
                </p>
                <Btn
                  variant="success"
                  className="w-full"
                  disabled={invoicing}
                  onClick={async () => {
                    // Save first if dirty
                    if (dirty) await saveRO();
                    setInvoicing(true);
                    await generateInvoice(wo);
                    setInvoicing(false);
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Icon d={icons.file} size={18} />
                    {invoicing ? 'Generating Invoice...' : 'Complete & Generate Invoice'}
                  </span>
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed state */}
      {isCompleted && (
        <div className="bg-slate-800/50 border border-bdr rounded-xl p-4 flex items-center gap-3">
          <Icon d={icons.check} size={20} stroke="#64748b" />
          <div>
            <div className="text-sm text-slate-400 font-semibold">Repair Order Completed</div>
            <div className="text-xs text-slate-600">
              This RO has been converted to an invoice. View it in the Invoicing section.
            </div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      {activityLog.length > 0 && (
        <div className="border-t border-bdr pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-heading text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Icon d={icons.clock} size={12} stroke="#64748b" />
              Activity Log
              <span className="text-slate-700">({activityLog.length})</span>
            </h4>
            {activityLog.length > 5 && (
              <button
                onClick={() => setActivityExpanded(!activityExpanded)}
                className="text-[10px] text-accent hover:text-accent/80 font-medium transition"
              >
                {activityExpanded ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          <div className="relative pl-4">
            {/* Timeline line */}
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-700/50" />
            <div className="space-y-2.5">
              {(activityExpanded ? activityLog : activityLog.slice(0, 5)).map((entry) => {
                const date = new Date(entry.created_at);
                const now = new Date();
                const diffMs = now.getTime() - date.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHrs = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                let timeStr: string;
                if (diffMins < 1) timeStr = 'just now';
                else if (diffMins < 60) timeStr = `${diffMins}m ago`;
                else if (diffHrs < 24) timeStr = `${diffHrs}h ago`;
                else if (diffDays < 7) timeStr = `${diffDays}d ago`;
                else timeStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                return (
                  <div key={entry.id} className="relative flex items-start gap-2.5">
                    {/* Timeline dot */}
                    <div className="absolute -left-4 top-[5px] w-[11px] h-[11px] rounded-full border-2 border-accent bg-bg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-400 leading-snug">{entry.action}</div>
                      {entry.details && <div className="text-[10px] text-slate-600 mt-0.5">{entry.details}</div>}
                    </div>
                    <div className="text-[10px] text-slate-600 whitespace-nowrap flex-shrink-0 pt-0.5">{timeStr}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Work Order */}
      <div className="border-t border-bdr pt-4">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 text-xs text-slate-600 hover:text-error transition font-heading uppercase tracking-wider"
          >
            <Icon d={icons.trash} size={14} />
            Delete Work Order
          </button>
        ) : (
          <div className="bg-error/5 border border-error/20 rounded-xl p-4">
            <p className="text-sm text-error font-semibold mb-1">Delete {wo.display_id}?</p>
            <p className="text-xs text-slate-500 mb-3">
              This will permanently remove the work order, all labor/parts lines, photos, and related notifications. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Btn
                small
                variant="danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await deleteWO(wo.id);
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </Btn>
              <Btn small variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
