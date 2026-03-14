'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Btn } from '@/components/ui/Btn';
import { NewWOModal } from '@/components/NewWOModal';
import { SetupWizard } from '@/components/SetupWizard';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import {
  WorkOrder,
  Tech,
  Appointment,
  Invoice,
  ServiceReminder,
  STATUS_COLORS,
  PRIORITY_COLORS,
  type WOStatus,
  type ShopSettings,
  type TimeEntry,
  type CannedJob,
} from '@/lib/types';

const KANBAN_STATUSES: WOStatus[] = ['Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup'];
const PIPELINE_STATUSES: WOStatus[] = ['Scheduled', 'Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup'];
const STATUS_BAR_COLORS: Record<string, string> = {
  'Scheduled': '#8b5cf6',
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  const [cannedJobs, setCannedJobs] = useState<CannedJob[]>([]);
  const [showChecklist, setShowChecklist] = useState(true);
  const [activeShifts, setActiveShifts] = useState<TimeEntry[]>([]);
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [activities, setActivities] = useState<Array<{
    id: string;
    work_order_id: string;
    action: string;
    details: string | null;
    created_at: string;
    work_order?: { id: string; display_id: string } | null;
  }>>([]);
  const [reportData, setReportData] = useState<{ revenue_this_month?: number; low_stock_count?: number } | null>(null);
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedWidget((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedWidget(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch('/api/work-orders').then((r) => r.json()),
      fetch('/api/techs').then((r) => r.json()),
      fetch(`/api/appointments?start=${today}&end=${today}`).then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/reports').then((r) => r.json()),
      fetch('/api/invoices').then((r) => r.json()),
      fetch('/api/time-clock?type=shift&active=true').then((r) => r.json()),
      fetch('/api/canned-jobs').then((r) => r.json()),
      fetch('/api/service-reminders?status=Pending').then((r) => r.json()),
      fetch('/api/activity').then((r) => r.json()),
    ]).then(([woJson, t, a, s, rpt, invJson, shifts, cj, rem, act]) => {
      const wo = Array.isArray(woJson) ? woJson : woJson.data ?? [];
      setWorkOrders(wo);
      if (Array.isArray(t)) setTechs(t);
      if (Array.isArray(a)) setAppointments(a);
      const inv = Array.isArray(invJson) ? invJson : invJson.data ?? [];
      setInvoices(inv);
      if (Array.isArray(shifts)) setActiveShifts(shifts);
      if (Array.isArray(cj)) setCannedJobs(cj);
      if (Array.isArray(rem)) setReminders(rem);
      if (Array.isArray(act)) setActivities(act);
      setShopSettings(s);
      setReportData(rpt);
      setLoaded(true);
      // Best-effort: trigger auto-send for due service reminders
      fetch('/api/service-reminders/send-due', { method: 'POST' }).catch(() => {});
    }).catch(() => setLoaded(true));
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

  const monthRevenue = reportData?.revenue_this_month ?? 0;
  const lowStock = reportData?.low_stock_count ?? 0;

  const stats = [
    { label: 'Open Work Orders', value: String(openWOs.length), sub: highP + ' high priority', color: '#f97316', icon: icons.wrench, href: '/work-orders' },
    { label: 'Monthly Revenue', value: fmt(monthRevenue), sub: 'This month', color: '#22c55e', icon: icons.dollar, href: '/reports' },
    { label: 'Vehicles In Shop', value: String(inShop), sub: inShop === 1 ? '1 bay active' : inShop + ' bays active', color: '#3b82f6', icon: icons.truck, href: '/work-orders?status=In+Progress' },
    { label: 'Parts Low Stock', value: String(lowStock), sub: lowStock > 0 ? 'Reorder needed' : 'Stock OK', color: '#ef4444', icon: icons.alert, href: '/inventory?filter=low-stock' },
  ];

  const todayAppts = useMemo(
    () =>
      [...appointments].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      ),
    [appointments]
  );

  const overdueInvoices = useMemo(
    () =>
      invoices.filter((inv) => {
        if (inv.status === 'Overdue') return true;
        if (inv.status === 'Sent') {
          // Consider "Sent" invoices older than 30 days as past due
          const created = new Date(inv.created_at);
          const now = new Date();
          const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          return daysSince > 30;
        }
        return false;
      }),
    [invoices]
  );

  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STATUSES) {
      counts[s] = workOrders.filter((w) => w.status === s).length;
    }
    return counts;
  }, [workOrders]);

  const pipelineTotal = useMemo(
    () => PIPELINE_STATUSES.reduce((sum, s) => sum + (pipelineCounts[s] || 0), 0),
    [pipelineCounts]
  );

  const refreshWorkOrders = async () => {
    const json = await fetch('/api/work-orders').then((r) => r.json());
    setWorkOrders(Array.isArray(json) ? json : json.data ?? []);
  };

  if (!loaded) return null;

  // Show setup wizard for new shops
  const needsSetup = !shopSettings?.setup_completed_at && techs.length === 0 && cannedJobs.length === 0;
  if (needsSetup) {
    return <SetupWizard initialSettings={{
      shop_name: shopSettings?.shop_name,
      phone: shopSettings?.phone,
      address: shopSettings?.address,
      default_labor_rate: shopSettings?.default_labor_rate,
      tax_rate: shopSettings?.tax_rate,
    }} />;
  }

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

      {/* Setup Checklist */}
      {showChecklist && shopSettings?.setup_completed_at && (() => {
        const checks = [
          { label: 'Shop name & phone', done: !!(shopSettings.shop_name && shopSettings.phone), href: '/settings' },
          { label: 'Labor rate configured', done: shopSettings.default_labor_rate > 0, href: '/settings' },
          { label: 'At least 1 technician', done: techs.length > 0, href: '/settings?tab=team' },
          { label: 'At least 1 service template', done: cannedJobs.length > 0, href: '/settings?tab=team' },
          { label: 'SMS or payments connected', done: !!(shopSettings.twilio_account_sid || shopSettings.stripe_secret_key), href: '/settings?tab=integrations' },
        ];
        const doneCount = checks.filter(c => c.done).length;
        if (doneCount >= checks.length) return null;
        return (
          <div className="bg-card border border-accent/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-heading font-bold text-white text-sm">Shop Setup</h3>
                <p className="text-xs text-slate-500 mt-0.5">{doneCount} of {checks.length} steps complete</p>
              </div>
              <button onClick={() => setShowChecklist(false)} className="text-slate-600 hover:text-slate-400 transition">
                <Icon d={icons.x} size={16} />
              </button>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-bg mb-4">
              <div className="bg-accent rounded-full transition-all" style={{ width: `${(doneCount / checks.length) * 100}%` }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checks.map((c, i) => (
                <Link key={i} href={c.href} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition ${c.done ? 'text-slate-500' : 'text-slate-300 bg-bg/50 hover:bg-surface/50'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${c.done ? 'bg-accent/20' : 'border border-bdr'}`}>
                    {c.done && <Icon d={icons.check} size={10} stroke="#f97316" />}
                  </div>
                  <span className={c.done ? 'line-through' : ''}>{c.label}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Stat Cards */}
      <div className={expandedWidget === 'stats' ? 'fixed inset-0 z-50 bg-bg p-6 overflow-auto' : ''}>
        {expandedWidget === 'stats' && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-white tracking-wide text-lg">Stats Overview</h3>
            <button onClick={() => setExpandedWidget(null)} className="text-slate-400 hover:text-white transition p-1">
              <Icon d={icons.x} size={20} />
            </button>
          </div>
        )}
        <div className={expandedWidget === 'stats' ? 'grid grid-cols-2 sm:grid-cols-4 gap-6' : 'grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4'}>
          {stats.map((s, i) => (
            <Link key={i} href={s.href} className={`bg-card border border-bdr rounded-xl ${expandedWidget === 'stats' ? 'p-8' : 'p-5'} hover:border-slate-600 transition group cursor-pointer block`}>
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
              <div className={`${expandedWidget === 'stats' ? 'text-5xl' : 'text-3xl'} font-heading font-bold text-white`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.sub}</div>
            </Link>
          ))}
        </div>
        {expandedWidget !== 'stats' && (
          <div className="flex justify-end -mt-2">
            <button onClick={() => toggleExpand('stats')} className="text-slate-600 hover:text-slate-400 transition p-1" title="Expand">
              <Icon d={icons.expand} size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Work Order Pipeline Mini-Summary */}
      <div className="bg-card border border-bdr rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">
            Work Order Pipeline
          </span>
          <Link
            href="/work-orders"
            className="text-xs text-accent hover:text-orange-400 font-heading font-semibold tracking-wider uppercase"
          >
            Kanban &rarr;
          </Link>
        </div>
        {/* Status count chips */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
          {PIPELINE_STATUSES.map((s) => {
            const cnt = pipelineCounts[s] || 0;
            const c = STATUS_BAR_COLORS[s];
            return (
              <div
                key={s}
                className="flex items-center gap-2 bg-bg border border-bdr rounded-lg px-3 py-2 cursor-pointer hover:border-slate-500 transition"
                onClick={() => router.push('/work-orders')}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c }} />
                <span className="text-xs text-slate-400 truncate flex-1">{s === 'Waiting on Parts' ? 'Parts' : s}</span>
                <span className="text-sm font-heading font-bold" style={{ color: c }}>{cnt}</span>
              </div>
            );
          })}
        </div>
        {/* Pipeline bar */}
        <div className="flex h-2 rounded-full overflow-hidden bg-bg">
          {PIPELINE_STATUSES.map((s) => {
            const cnt = pipelineCounts[s] || 0;
            const pct = pipelineTotal > 0 ? (cnt / pipelineTotal) * 100 : 0;
            return (
              <div key={s} style={{ width: pct + '%', background: STATUS_BAR_COLORS[s] }} className="transition-all" />
            );
          })}
        </div>
      </div>

      {/* Today's Appointments + Overdue Invoices — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Today's Appointments */}
        <Link href="/scheduling" className="block">
          <div className="bg-card border border-bdr rounded-xl overflow-hidden hover:border-slate-600 transition h-full">
            <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#3b82f618' }}>
                  <Icon d={icons.calendar} size={16} stroke="#3b82f6" />
                </div>
                <h3 className="font-heading font-bold text-white tracking-wide text-sm">Today&apos;s Appointments</h3>
              </div>
              <span className="text-xs font-heading font-bold text-slate-500">
                {todayAppts.length} {todayAppts.length === 1 ? 'appt' : 'appts'}
              </span>
            </div>
            <div className="divide-y divide-bdr max-h-[320px] overflow-y-auto">
              {todayAppts.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Icon d={icons.calendar} size={28} stroke="#334155" className="mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No appointments today</p>
                </div>
              )}
              {todayAppts.map((a) => {
                const tech = techs.find((t) => t.id === a.tech_id);
                const startDate = new Date(a.start_time);
                const startStr = formatTime(startDate);
                const durationHrs = a.duration_minutes / 60;
                const vehicleStr = a.vehicle
                  ? `${a.vehicle.year || ''} ${a.vehicle.make} ${a.vehicle.model}`.trim()
                  : '';
                return (
                  <div key={a.id} className="px-4 py-3 hover:bg-surface/30 transition flex items-center gap-3">
                    <div className="w-1 h-9 rounded-full shrink-0" style={{ background: tech?.color || '#64748b' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-medium truncate">{a.customer?.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {vehicleStr}{vehicleStr && a.job ? ' \u00b7 ' : ''}{a.job}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-300 font-medium">{startStr}</div>
                      <div className="text-[11px] text-slate-500">{durationHrs}h</div>
                    </div>
                    {tech && (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: tech.color + '20', color: tech.color }}
                      >
                        {tech.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Link>

        {/* Overdue Invoices */}
        <Link href="/invoicing" className="block">
          <div className="bg-card border border-bdr rounded-xl overflow-hidden hover:border-slate-600 transition h-full">
            <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ef444418' }}>
                  <Icon d={icons.alert} size={16} stroke="#ef4444" />
                </div>
                <h3 className="font-heading font-bold text-white tracking-wide text-sm">Overdue Invoices</h3>
              </div>
              {overdueInvoices.length > 0 && (
                <span className="text-xs font-heading font-bold px-2 py-0.5 rounded-full" style={{ background: '#ef444418', color: '#ef4444' }}>
                  {overdueInvoices.length} overdue
                </span>
              )}
            </div>
            <div className="divide-y divide-bdr max-h-[320px] overflow-y-auto">
              {overdueInvoices.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <Icon d={icons.check} size={28} stroke="#22c55e" className="mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No overdue invoices</p>
                </div>
              )}
              {overdueInvoices.map((inv) => {
                const created = new Date(inv.created_at);
                const daysSince = Math.floor((new Date().getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                const vehicleStr = inv.vehicle
                  ? `${inv.vehicle.year || ''} ${inv.vehicle.make} ${inv.vehicle.model}`.trim()
                  : '';
                return (
                  <div key={inv.id} className="px-4 py-3 hover:bg-surface/30 transition flex items-center gap-3">
                    <div className="w-1 h-9 rounded-full shrink-0" style={{ background: STATUS_COLORS[inv.status] || '#ef4444' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-accent text-xs font-bold">{inv.display_id}</span>
                        <span className="text-sm text-slate-200 font-medium truncate">{inv.customer?.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {vehicleStr}{vehicleStr ? ' \u00b7 ' : ''}{daysSince}d ago
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm text-white font-semibold">{fmt(inv.total)}</div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                );
              })}
            </div>
            {overdueInvoices.length > 0 && (
              <div className="px-5 py-2 border-t border-bdr bg-surface/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Total outstanding</span>
                  <span className="text-sm font-heading font-bold text-red-400">
                    {fmt(overdueInvoices.reduce((sum, inv) => sum + Number(inv.total), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Service Reminders Due */}
      {(() => {
        const now = new Date();
        const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const todayStr2 = now.toISOString().slice(0, 10);
        const weekStr = weekFromNow.toISOString().slice(0, 10);

        const dueReminders = reminders.filter(r => {
          if (!r.due_date) return false;
          return r.due_date <= weekStr;
        });
        const overdue = dueReminders.filter(r => r.due_date! < todayStr2);
        const dueSoon = dueReminders.filter(r => r.due_date! >= todayStr2);

        if (dueReminders.length === 0) return null;

        return (
          <div className="bg-card border border-bdr rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
              <h3 className="font-heading font-bold text-white tracking-wide flex items-center gap-2">
                <Icon d={icons.bell} size={16} stroke="#f59e0b" />
                Service Reminders
              </h3>
              <span className="text-xs text-slate-500">{dueReminders.length} due</span>
            </div>
            <div className="divide-y divide-bdr max-h-[300px] overflow-y-auto">
              {overdue.length > 0 && (
                <div className="px-4 py-1.5 bg-red-500/5">
                  <span className="text-[10px] font-heading font-bold text-red-400 uppercase tracking-wider">Overdue</span>
                </div>
              )}
              {overdue.map(r => (
                <Link key={r.id} href={`/customers?open=${r.customer_id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition block">
                  <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 font-medium truncate">{r.customer?.name || 'Customer'}</div>
                    <div className="text-xs text-slate-500 truncate">{r.service_type}</div>
                  </div>
                  <div className="text-xs text-red-400 shrink-0">
                    {r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </div>
                </Link>
              ))}
              {dueSoon.length > 0 && (
                <div className="px-4 py-1.5 bg-amber-500/5">
                  <span className="text-[10px] font-heading font-bold text-amber-400 uppercase tracking-wider">Due This Week</span>
                </div>
              )}
              {dueSoon.map(r => (
                <Link key={r.id} href={`/customers?open=${r.customer_id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition block">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-200 font-medium truncate">{r.customer?.name || 'Customer'}</div>
                    <div className="text-xs text-slate-500 truncate">{r.service_type}</div>
                  </div>
                  <div className="text-xs text-amber-400 shrink-0">
                    {r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Tech Dispatch Board */}
      <div className={expandedWidget === 'techs' ? 'fixed inset-0 z-50 bg-bg overflow-auto flex flex-col' : 'bg-card border border-bdr rounded-xl overflow-hidden'}>
        <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
          <h3 className="font-heading font-bold text-white tracking-wide">Tech Dispatch Board</h3>
          <div className="flex items-center gap-3">
            <Link
              href="/work-orders"
              className="text-xs text-accent hover:text-orange-400 font-heading font-semibold tracking-wider uppercase"
            >
              Kanban &rarr;
            </Link>
            <button onClick={() => toggleExpand('techs')} className="text-slate-600 hover:text-slate-400 transition p-1" title={expandedWidget === 'techs' ? 'Collapse' : 'Expand'}>
              <Icon d={expandedWidget === 'techs' ? icons.x : icons.expand} size={14} />
            </button>
          </div>
        </div>
        <div className="divide-y divide-bdr">
          {techs.map((tech) => {
            const techWOs = workOrders.filter((w) => w.tech_id === tech.id);
            const activeHrs = techWOs
              .filter((w) => w.status !== 'Ready for Pickup' && w.status !== 'Completed')
              .reduce((s, w) => s + (w.labor_hours || 0), 0);
            const isClockedIn = activeShifts.some((s) => s.tech_id === tech.id);
            return (
              <div key={tech.id} className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative shrink-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: tech.color + '20', color: tech.color }}
                    >
                      {tech.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                        isClockedIn ? 'bg-green-400' : 'bg-slate-600'
                      }`}
                    />
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

      {expandedWidget === 'orders' ? (
        /* All Work Orders — Expanded */
        <div className="fixed inset-0 z-50 bg-bg overflow-auto flex flex-col">
          <div className="px-6 py-4 border-b border-bdr flex items-center justify-between shrink-0">
            <h3 className="font-heading font-bold text-white tracking-wide text-lg">All Work Orders</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{workOrders.length} total</span>
              <button onClick={() => setExpandedWidget(null)} className="text-slate-400 hover:text-white transition p-1">
                <Icon d={icons.x} size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
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
                    <tr key={w.id} className="hover:bg-surface/30 transition cursor-pointer" onClick={() => router.push(`/work-orders?wo=${w.display_id}`)}>
                      <TD><span className="text-accent font-semibold text-xs">{w.display_id}</span></TD>
                      <TD><span className="text-slate-200 text-xs">{w.customer?.name}</span></TD>
                      <TD><span className="text-slate-400 text-[11px]">{vehicleStr}</span></TD>
                      <TD><span className="text-slate-300 text-xs">{w.job}</span></TD>
                      <TD><span className="text-xs" style={{ color: w.tech?.color }}>{w.tech?.name?.split(' ')[0]}</span></TD>
                      <TD><StatusBadge status={w.status} /></TD>
                      <TD className="text-right"><span className="text-slate-200 text-xs font-medium">{fmt(w.estimated_total || 0)}</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* All Work Orders — Inline */
        <div className="bg-card border border-bdr rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-bdr flex items-center justify-between">
            <h3 className="font-heading font-bold text-white tracking-wide">All Work Orders</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{workOrders.length} total</span>
              <button onClick={() => toggleExpand('orders')} className="text-slate-600 hover:text-slate-400 transition p-1" title="Expand">
                <Icon d={icons.expand} size={14} />
              </button>
            </div>
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
      )}

      {/* Recent Activity */}
      {activities.length > 0 && (
        <div className="bg-card border border-bdr rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-bdr">
            <h3 className="font-heading font-bold text-white tracking-wide">Recent Activity</h3>
          </div>
          <div className="divide-y divide-bdr max-h-[350px] overflow-y-auto">
            {activities.map(a => {
              const timeAgo = (() => {
                const seconds = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 1000);
                if (seconds < 60) return 'just now';
                const minutes = Math.floor(seconds / 60);
                if (minutes < 60) return `${minutes}m ago`;
                const hours = Math.floor(minutes / 60);
                if (hours < 24) return `${hours}h ago`;
                const days = Math.floor(hours / 24);
                if (days === 1) return 'yesterday';
                if (days < 7) return `${days}d ago`;
                return new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })();

              return (
                <Link
                  key={a.id}
                  href={a.work_order ? `/work-orders?open=${a.work_order.id}` : '/work-orders'}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-surface/50 transition block"
                >
                  <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-300">
                      {a.work_order && (
                        <span className="text-accent font-heading font-bold mr-1.5">{a.work_order.display_id}</span>
                      )}
                      {a.action}
                    </div>
                    {a.details && (
                      <div className="text-xs text-slate-600 truncate mt-0.5">{a.details}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-600 shrink-0">{timeAgo}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* New Work Order Modal */}
      <NewWOModal
        open={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        techs={techs}
        onCreated={refreshWorkOrders}
        defaultLaborRate={shopSettings?.default_labor_rate ? Number(shopSettings.default_labor_rate) : 125}
      />
    </div>
  );
}
