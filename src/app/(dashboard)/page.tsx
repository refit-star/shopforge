'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import {
  WorkOrder,
  Tech,
  Appointment,
  Customer,
  Vehicle,
  STATUS_COLORS,
  PRIORITY_COLORS,
  WO_STATUSES,
  type WOStatus,
  type Priority,
} from '@/lib/types';

const KANBAN_STATUSES: WOStatus[] = ['Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup'];
const STATUS_BAR_COLORS: Record<string, string> = {
  'Check-In': '#3b82f6',
  'In Progress': '#f97316',
  'Waiting on Parts': '#fbbf24',
  'Ready for Pickup': '#22c55e',
};

export default function DashboardPage() {
  const router = useRouter();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Quick Add form state
  const [qaCustomerSearch, setQaCustomerSearch] = useState('');
  const [qaCustomerResults, setQaCustomerResults] = useState<Customer[]>([]);
  const [qaSelectedCustomer, setQaSelectedCustomer] = useState<Customer | null>(null);
  const [qaCustomerVehicles, setQaCustomerVehicles] = useState<Vehicle[]>([]);
  const [qaVehicleId, setQaVehicleId] = useState('');
  const [qaPriority, setQaPriority] = useState<Priority>('low');
  const [qaJob, setQaJob] = useState('');
  const [qaTechId, setQaTechId] = useState('');
  const [qaHours, setQaHours] = useState('');
  const [qaNotes, setQaNotes] = useState('');
  const [qaShowDropdown, setQaShowDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch('/api/work-orders').then((r) => r.json()),
      fetch('/api/techs').then((r) => r.json()),
      fetch(`/api/appointments?start=${today}&end=${today}`).then((r) => r.json()),
    ]).then(([wo, t, a]) => {
      setWorkOrders(wo);
      setTechs(t);
      setAppointments(a);
      setLoaded(true);
    });
  }, []);

  const openWOs = useMemo(() => workOrders.filter((w) => w.status !== 'Completed'), [workOrders]);
  const highP = useMemo(() => openWOs.filter((w) => w.priority === 'high').length, [openWOs]);
  const inShop = useMemo(
    () => workOrders.filter((w) => w.status === 'In Progress' || w.status === 'Waiting on Parts').length,
    [workOrders]
  );

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const stats = [
    { label: 'Open Work Orders', value: String(openWOs.length), sub: highP + ' high priority', color: '#f97316', icon: icons.wrench },
    { label: "Today's Revenue", value: '$3,850', sub: '+18% vs last Mon', color: '#22c55e', icon: icons.dollar },
    { label: 'Vehicles In Shop', value: String(inShop), sub: 'All bays active', color: '#3b82f6', icon: icons.truck },
    { label: 'Parts Low Stock', value: '4', sub: 'Reorder needed', color: '#ef4444', icon: icons.alert },
  ];

  const todayAppts = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      ),
    [appointments]
  );

  // Customer search for Quick Add
  const handleCustomerSearch = (q: string) => {
    setQaCustomerSearch(q);
    setQaSelectedCustomer(null);
    setQaCustomerVehicles([]);
    setQaVehicleId('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setQaCustomerResults([]);
      setQaShowDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setQaCustomerResults(data);
      setQaShowDropdown(true);
    }, 250);
  };

  const selectCustomer = async (c: Customer) => {
    setQaSelectedCustomer(c);
    setQaCustomerSearch(c.name);
    setQaShowDropdown(false);
    // Fetch this customer's vehicles
    const res = await fetch(`/api/customers/${c.id}`);
    const detail = await res.json();
    setQaCustomerVehicles(detail.vehicles || []);
    if (detail.vehicles?.length === 1) {
      setQaVehicleId(detail.vehicles[0].id);
    }
  };

  const handleCreateWO = async () => {
    if (!qaSelectedCustomer || !qaVehicleId || !qaJob.trim()) return;
    await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: qaSelectedCustomer.id,
        vehicle_id: qaVehicleId,
        priority: qaPriority,
        job: qaJob,
        tech_id: qaTechId || null,
        notes: qaNotes,
      }),
    });
    setShowQuickAdd(false);
    // Reset form
    setQaCustomerSearch('');
    setQaSelectedCustomer(null);
    setQaCustomerVehicles([]);
    setQaVehicleId('');
    setQaPriority('low');
    setQaJob('');
    setQaTechId('');
    setQaHours('');
    setQaNotes('');
    // Refresh work orders
    const wo = await fetch('/api/work-orders').then((r) => r.json());
    setWorkOrders(wo);
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm">{todayStr}</p>
        <Btn onClick={() => setShowQuickAdd(true)}>
          <span className="flex items-center gap-2">
            <Icon d={icons.plus} size={16} />
            New Work Order
          </span>
        </Btn>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-card border border-bdr rounded-xl p-5 hover:border-slate-600 transition group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-[0.12em]">
                {s.label}
              </span>
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: s.color + '18' }}
              >
                <Icon d={s.icon} size={18} stroke={s.color} />
              </div>
            </div>
            <div className="text-3xl font-heading font-bold text-white">{s.value}</div>
            <div className="text-xs text-slate-500 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Status Pipeline */}
      <div className="bg-card border border-bdr rounded-xl p-4">
        <div className="flex items-center gap-6 mb-3">
          <span className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">
            Job Pipeline
          </span>
          <div className="flex items-center gap-4 ml-auto">
            {KANBAN_STATUSES.map((s) => {
              const cnt = workOrders.filter((w) => w.status === s).length;
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_BAR_COLORS[s] }} />
                  <span className="text-xs text-slate-400">{s}</span>
                  <span className="text-xs font-bold ml-0.5" style={{ color: STATUS_BAR_COLORS[s] }}>
                    {cnt}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-bg">
          {KANBAN_STATUSES.map((s) => {
            const cnt = workOrders.filter((w) => w.status === s).length;
            const pct = workOrders.length > 0 ? (cnt / workOrders.length) * 100 : 0;
            return (
              <div key={s} style={{ width: pct + '%', background: STATUS_BAR_COLORS[s] }} className="transition-all" />
            );
          })}
        </div>
      </div>

      {/* Tech Dispatch Board */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
          <h3 className="font-heading font-bold text-white tracking-wide">Tech Dispatch Board</h3>
          <Link
            href="/work-orders"
            className="text-xs text-accent hover:text-orange-400 font-heading font-semibold tracking-wider uppercase"
          >
            Kanban &rarr;
          </Link>
        </div>
        <div className="divide-y divide-bdr">
          {techs.map((tech) => {
            const techWOs = workOrders.filter((w) => w.tech_id === tech.id);
            const activeHrs = techWOs
              .filter((w) => w.status !== 'Ready for Pickup' && w.status !== 'Completed')
              .reduce((s, w) => s + (w.labor_hours || 0), 0);
            return (
              <div key={tech.id} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: tech.color + '20', color: tech.color }}
                  >
                    {tech.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>
                  <span className="text-sm font-medium text-white">{tech.name}</span>
                  <span className="text-xs text-slate-500">
                    {techWOs.length} jobs &middot; {activeHrs}h queued
                  </span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {techWOs.map((w) => {
                    const prioC = PRIORITY_COLORS[w.priority] || '#22c55e';
                    const stC = STATUS_BAR_COLORS[w.status] || '#64748b';
                    const vehicleLabel = w.vehicle
                      ? `${w.vehicle.make} ${w.vehicle.model}`
                      : '';
                    return (
                      <div
                        key={w.id}
                        onClick={() => router.push(`/work-orders?wo=${w.display_id}`)}
                        className="relative bg-bg border border-bdr rounded-lg p-3 pl-4 min-w-[185px] max-w-[210px] shrink-0 cursor-pointer hover:border-slate-500 transition"
                      >
                        <div
                          className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
                          style={{ background: prioC }}
                        />
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-accent text-[11px] font-bold font-heading">{w.display_id}</span>
                          <span className="text-[10px] text-slate-500">{w.labor_hours || 0}h</span>
                        </div>
                        <div className="text-xs text-slate-200 font-medium truncate">{vehicleLabel}</div>
                        <div className="text-[11px] text-slate-400 truncate mb-1.5">{w.job}</div>
                        <div className="flex items-center justify-between">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
                            style={{ background: stC + '15', color: stC }}
                          >
                            <span className="w-1 h-1 rounded-full" style={{ background: stC }} />
                            {w.status === 'Waiting on Parts' ? 'Parts' : w.status}
                          </span>
                          <span className="text-[11px] text-slate-300 font-semibold">
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
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* All Work Orders */}
        <div className="col-span-2 bg-card border border-bdr rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
            <h3 className="font-heading font-bold text-white tracking-wide">All Work Orders</h3>
            <span className="text-xs text-slate-500">{workOrders.length} total</span>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-surface/80 sticky top-0 z-10">
                <tr>
                  <TH>WO#</TH>
                  <TH>Customer</TH>
                  <TH>Vehicle</TH>
                  <TH>Job</TH>
                  <TH>Tech</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-bdr">
                {workOrders.map((w) => {
                  const vehicleStr = w.vehicle
                    ? `${w.vehicle.year || ''} ${w.vehicle.make} ${w.vehicle.model}`
                    : '';
                  return (
                    <tr
                      key={w.id}
                      className="hover:bg-surface/30 transition cursor-pointer"
                      onClick={() => router.push(`/work-orders?wo=${w.display_id}`)}
                    >
                      <TD>
                        <span className="text-accent font-semibold text-xs">{w.display_id}</span>
                      </TD>
                      <TD>
                        <span className="text-slate-200 text-xs">{w.customer?.name}</span>
                      </TD>
                      <TD>
                        <span className="text-slate-400 text-[11px]">{vehicleStr}</span>
                      </TD>
                      <TD>
                        <span className="text-slate-300 text-xs">{w.job}</span>
                      </TD>
                      <TD>
                        <span className="text-xs" style={{ color: w.tech?.color }}>
                          {w.tech?.name?.split(' ')[0]}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge status={w.status} />
                      </TD>
                      <TD className="text-right">
                        <span className="text-slate-200 text-xs font-medium">
                          {fmt(w.estimated_total || 0)}
                        </span>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-card border border-bdr rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-bdr flex items-center justify-between">
            <h3 className="font-heading font-bold text-white tracking-wide text-sm">Today</h3>
            <Link
              href="/scheduling"
              className="text-xs text-accent hover:text-orange-400 font-heading font-semibold tracking-wider uppercase"
            >
              Cal &rarr;
            </Link>
          </div>
          <div className="divide-y divide-bdr max-h-[300px] overflow-y-auto">
            {todayAppts.map((a) => {
              const tech = techs.find((t) => t.id === a.tech_id);
              const startDate = new Date(a.start_time);
              const startStr = formatTime(startDate);
              const durationHrs = a.duration_minutes / 60;
              const vehicleStr = a.vehicle
                ? `${a.vehicle.year || ''} ${a.vehicle.make} ${a.vehicle.model}`
                : '';
              return (
                <div key={a.id} className="px-4 py-2 hover:bg-surface/30 transition flex items-center gap-2">
                  <div className="w-1 h-7 rounded-full shrink-0" style={{ background: tech?.color || '#64748b' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200 font-medium truncate">{a.customer?.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {vehicleStr} &middot; {a.job}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-300 font-medium">{startStr}</div>
                    <div className="text-[11px] text-slate-500">{durationHrs}h</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Add WO Modal */}
      <Modal open={showQuickAdd} onClose={() => { setShowQuickAdd(false); setQaShowDropdown(false); }} title="New Work Order">
        <div className="space-y-4">
          {/* Customer Search */}
          <div className="relative">
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Customer *
            </label>
            <input
              value={qaCustomerSearch}
              onChange={(e) => handleCustomerSearch(e.target.value)}
              onFocus={() => { if (qaCustomerResults.length > 0 && !qaSelectedCustomer) setQaShowDropdown(true); }}
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
              placeholder="Type to search customers..."
            />
            {qaSelectedCustomer && (
              <button
                onClick={() => { setQaSelectedCustomer(null); setQaCustomerSearch(''); setQaCustomerVehicles([]); setQaVehicleId(''); }}
                className="absolute right-3 top-[34px] text-slate-500 hover:text-white"
              >
                <Icon d={icons.x} size={14} />
              </button>
            )}
            {qaShowDropdown && qaCustomerResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {qaCustomerResults.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className="w-full px-3 py-2.5 text-left hover:bg-surface/50 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm text-white">{c.name}</div>
                      <div className="text-xs text-slate-500">{c.phone || c.email || ''}</div>
                    </div>
                    <span className="text-xs text-slate-500">{c.vehicle_count ?? 0} vehicles</span>
                  </button>
                ))}
              </div>
            )}
            {qaShowDropdown && qaCustomerSearch.trim() && qaCustomerResults.length === 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl p-3 text-sm text-slate-500">
                No customers found.
              </div>
            )}
          </div>

          {/* Vehicle + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Vehicle *
              </label>
              <select
                value={qaVehicleId}
                onChange={(e) => setQaVehicleId(e.target.value)}
                disabled={!qaSelectedCustomer}
                className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body disabled:opacity-40"
              >
                <option value="">{qaSelectedCustomer ? 'Select vehicle...' : 'Select customer first'}</option>
                {qaCustomerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.year || ''} {v.make} {v.model} {v.plate ? `(${v.plate})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={qaPriority}
                onChange={(e) => setQaPriority(e.target.value as Priority)}
                className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-400 focus:outline-none focus:border-accent/50 font-body"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Job Description *
            </label>
            <input
              value={qaJob}
              onChange={(e) => setQaJob(e.target.value)}
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
              placeholder="e.g. Brake pad replacement"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Assigned Tech
              </label>
              <select
                value={qaTechId}
                onChange={(e) => setQaTechId(e.target.value)}
                className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-400 focus:outline-none focus:border-accent/50 font-body"
              >
                <option value="">Select tech...</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Est. Hours
              </label>
              <input
                type="number"
                value={qaHours}
                onChange={(e) => setQaHours(e.target.value)}
                className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                placeholder="0.0"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Notes
            </label>
            <textarea
              rows={3}
              value={qaNotes}
              onChange={(e) => setQaNotes(e.target.value)}
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body resize-none"
              placeholder="Customer complaint, initial observations..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowQuickAdd(false)}>
              Cancel
            </Btn>
            <Btn onClick={handleCreateWO} disabled={!qaSelectedCustomer || !qaVehicleId || !qaJob.trim()}>
              Create Work Order
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
