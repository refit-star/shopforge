'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';
import { TH, TD } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmt } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================
interface LaborTech {
  tech_id: string;
  tech_name: string;
  tech_color: string;
  billed_hours: number;
  billed_revenue: number;
  actual_hours: number;
  efficiency_pct: number;
  effective_rate: number;
}

interface PartsByJob {
  wo_id: string;
  wo_display_id: string;
  job: string;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

interface JobRow {
  wo_id: string;
  display_id: string;
  job: string;
  customer_name: string;
  completed_at: string;
  labor_revenue: number;
  parts_revenue: number;
  total_revenue: number;
  parts_cost: number;
  parts_profit: number;
  margin_pct: number;
}

interface ReportData {
  period: { from: string; to: string };
  revenue: {
    total: number; labor: number; parts: number; tax: number;
    invoice_count: number; avg_ticket: number; paid: number; outstanding: number;
  };
  monthly: { month: string; total: number; labor: number; parts: number }[];
  labor: {
    techs: LaborTech[];
    totals: { billed_hours: number; actual_hours: number; billed_revenue: number; efficiency_pct: number };
  };
  parts: {
    total_revenue: number; total_cost: number; total_profit: number; markup_pct: number;
    by_job: PartsByJob[];
  };
  jobs: JobRow[];
  top_services: { job: string; count: number }[];
  open_work_orders: number;
  low_stock_count: number;
  completed_count: number;
}

// ============================================================
// DATE PRESETS
// ============================================================
function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const d = new Date(now);
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    case 'month':
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: d.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    case 'quarter': {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: qStart.toISOString().slice(0, 10), to: today };
    }
    case 'ytd':
      return { from: `${now.getFullYear()}-01-01`, to: today };
    default:
      return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'ytd', label: 'YTD' },
] as const;

// ============================================================
// CSV EXPORT
// ============================================================
function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t]/.test(s)) s = "'" + s;
  return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCSV(data: ReportData): string {
  const rows: string[] = [];
  rows.push(`ShopForge Report — ${data.period.from} to ${data.period.to}`);
  rows.push('');

  rows.push('--- Revenue Summary ---');
  rows.push('Metric,Value');
  rows.push(`Total Revenue,${data.revenue.total.toFixed(2)}`);
  rows.push(`Labor Revenue,${data.revenue.labor.toFixed(2)}`);
  rows.push(`Parts Revenue,${data.revenue.parts.toFixed(2)}`);
  rows.push(`Tax Collected,${data.revenue.tax.toFixed(2)}`);
  rows.push(`Invoices Paid,${data.revenue.invoice_count}`);
  rows.push(`Avg Ticket,${data.revenue.avg_ticket.toFixed(2)}`);
  rows.push(`Outstanding,${data.revenue.outstanding.toFixed(2)}`);
  rows.push('');

  rows.push('--- Labor Profitability ---');
  rows.push('Technician,Billed Hours,Actual Hours,Efficiency %,Revenue,Effective Rate');
  for (const t of data.labor.techs) {
    rows.push(`${esc(t.tech_name)},${t.billed_hours},${t.actual_hours},${t.efficiency_pct}%,$${t.billed_revenue.toFixed(2)},$${t.effective_rate.toFixed(2)}`);
  }
  rows.push('');

  rows.push('--- Parts Margin ---');
  rows.push(`Parts Revenue,${data.parts.total_revenue.toFixed(2)}`);
  rows.push(`Parts Cost,${data.parts.total_cost.toFixed(2)}`);
  rows.push(`Parts Profit,${data.parts.total_profit.toFixed(2)}`);
  rows.push(`Markup %,${data.parts.markup_pct.toFixed(1)}%`);
  rows.push('');
  rows.push('WO #,Job,Revenue,Cost,Profit,Margin %');
  for (const p of data.parts.by_job) {
    rows.push(`${esc(p.wo_display_id)},${esc(p.job)},${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${p.margin_pct.toFixed(1)}%`);
  }
  rows.push('');

  rows.push('--- Job Profitability ---');
  rows.push('WO #,Job,Customer,Labor Rev,Parts Rev,Total Rev,Parts Cost,Profit,Margin %');
  for (const j of data.jobs) {
    rows.push(`${esc(j.display_id)},${esc(j.job)},${esc(j.customer_name)},${j.labor_revenue.toFixed(2)},${j.parts_revenue.toFixed(2)},${j.total_revenue.toFixed(2)},${j.parts_cost.toFixed(2)},${j.parts_profit.toFixed(2)},${j.margin_pct.toFixed(1)}%`);
  }

  return rows.join('\n');
}

// ============================================================
// PAGE
// ============================================================
export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activePreset, setActivePreset] = useState('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchReport = useCallback(async (from: string, to: string) => {
    setLoaded(false);
    const res = await fetch(`/api/reports?from=${from}&to=${to}`);
    const d = await res.json();
    setData(d);
    setFromDate(from);
    setToDate(to);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const { from, to } = getPresetRange('month');
    fetchReport(from, to);
  }, [fetchReport]);

  const selectPreset = (key: string) => {
    setActivePreset(key);
    const { from, to } = getPresetRange(key);
    fetchReport(from, to);
  };

  const applyCustom = () => {
    if (fromDate && toDate) {
      setActivePreset('');
      fetchReport(fromDate, toDate);
    }
  };

  const exportCSV = () => {
    if (!data) return;
    downloadCSV(`shopforge-report-${fromDate}-to-${toDate}.csv`, buildCSV(data));
  };

  if (!loaded || !data) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-48 bg-card border border-bdr rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-card border border-bdr rounded-xl animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 bg-card border border-bdr rounded-xl animate-pulse" />)}</div>
      </div>
    );
  }

  const noData = data.revenue.total === 0 && data.jobs.length === 0 && data.labor.techs.length === 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-white tracking-wide">Reports & Analytics</h1>
        <Btn variant="secondary" small onClick={exportCSV} disabled={noData}>
          <span className="flex items-center gap-2"><Icon d={icons.download} size={14} />Export CSV</span>
        </Btn>
      </div>

      {/* Date Range */}
      <div className="bg-card border border-bdr rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => selectPreset(p.key)}
              className={`text-[11px] font-heading font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition ${
                activePreset === p.key
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-bdr'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="bg-bg border border-bdr rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent/50 font-body"
            />
            <span className="text-slate-600 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="bg-bg border border-bdr rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent/50 font-body"
            />
            <Btn small variant="secondary" onClick={applyCustom}>Apply</Btn>
          </div>
        </div>
      </div>

      {noData ? (
        <EmptyState
          icon={icons.chart}
          title="No Data for This Period"
          description="No completed work orders or paid invoices found in the selected date range. Try a wider range."
        />
      ) : (
        <>
          {/* ======================================================
              SECTION 1: REVENUE SUMMARY
              ====================================================== */}
          <div>
            <SectionTitle title="Revenue Summary" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <KPI label="Total Revenue" value={fmt(data.revenue.total)} accent />
              <KPI label="Labor Revenue" value={fmt(data.revenue.labor)} />
              <KPI label="Parts Revenue" value={fmt(data.revenue.parts)} />
              <KPI label="Tax Collected" value={fmt(data.revenue.tax)} />
              <KPI label="Invoices Paid" value={String(data.revenue.invoice_count)} />
              <KPI label="Avg Ticket" value={fmt(data.revenue.avg_ticket)} />
              <KPI label="Paid" value={fmt(data.revenue.paid)} color="text-success" />
              <KPI label="Outstanding" value={fmt(data.revenue.outstanding)} color={data.revenue.outstanding > 0 ? 'text-yellow-400' : undefined} />
            </div>
          </div>

          {/* ======================================================
              SECTION 2: REVENUE TREND
              ====================================================== */}
          {data.monthly.length > 0 && (
            <div className="bg-card border border-bdr rounded-xl p-5">
              <h3 className="font-heading font-bold text-white tracking-wide mb-4">Monthly Revenue</h3>
              <div className="flex items-end gap-2 h-48">
                {(() => {
                  const maxVal = Math.max(...data.monthly.map(m => m.total), 1);
                  return data.monthly.map((m, i) => {
                    const pct = (m.total / maxVal) * 100;
                    const label = new Date(m.month + '-01').toLocaleString('default', { month: 'short' });
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[10px] text-slate-400">{fmt(m.total)}</div>
                        <div className="w-full rounded-t-md bg-accent/80 transition-all" style={{ height: `${Math.max(pct, 4)}%` }} />
                        <div className="text-[10px] text-slate-500 font-heading">{label}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* ======================================================
              SECTION 3: LABOR PROFITABILITY
              ====================================================== */}
          {data.labor.techs.length > 0 && (
            <div>
              <SectionTitle title="Labor Profitability" />
              {/* Totals row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <KPI label="Billed Hours" value={`${data.labor.totals.billed_hours}h`} />
                <KPI label="Actual Hours" value={`${data.labor.totals.actual_hours}h`} />
                <KPI label="Labor Revenue" value={fmt(data.labor.totals.billed_revenue)} />
                <KPI
                  label="Efficiency"
                  value={data.labor.totals.actual_hours > 0 ? `${data.labor.totals.efficiency_pct}%` : 'N/A'}
                  color={effColor(data.labor.totals.efficiency_pct)}
                />
              </div>

              <div className="bg-card border border-bdr rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bdr">
                      <TH>Technician</TH>
                      <TH className="text-right">Billed</TH>
                      <TH className="text-right">Actual</TH>
                      <TH className="text-right">Efficiency</TH>
                      <TH className="text-right">Revenue</TH>
                      <TH className="text-right">$/Actual Hr</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {data.labor.techs.map(t => (
                      <tr key={t.tech_id} className="border-b border-bdr/50">
                        <TD>
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.tech_color }} />
                            <span className="text-sm text-white font-medium">{t.tech_name}</span>
                          </div>
                        </TD>
                        <TD className="text-right text-sm text-slate-300">{t.billed_hours}h</TD>
                        <TD className="text-right text-sm text-slate-400">{t.actual_hours > 0 ? `${t.actual_hours}h` : '—'}</TD>
                        <TD className="text-right">
                          {t.actual_hours > 0 ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-2 bg-bg rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(t.efficiency_pct, 150) / 1.5}%`,
                                    backgroundColor: t.efficiency_pct >= 100 ? '#22c55e' : t.efficiency_pct >= 80 ? '#f59e0b' : '#ef4444',
                                  }}
                                />
                              </div>
                              <span className={`text-sm font-medium ${effColor(t.efficiency_pct)}`}>
                                {t.efficiency_pct}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-600">—</span>
                          )}
                        </TD>
                        <TD className="text-right text-sm text-white font-medium">{fmt(t.billed_revenue)}</TD>
                        <TD className="text-right text-sm text-slate-300">
                          {t.actual_hours > 0 ? fmt(t.effective_rate) : '—'}
                        </TD>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.labor.totals.actual_hours === 0 && data.labor.totals.billed_hours > 0 && (
                <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
                  <Icon d={icons.alert} size={12} stroke="#64748b" />
                  No time clock data for this period — clock job timers to see efficiency metrics
                </div>
              )}
            </div>
          )}

          {/* ======================================================
              SECTION 4: PARTS MARGIN
              ====================================================== */}
          {(data.parts.total_revenue > 0 || data.parts.total_cost > 0) && (
            <div>
              <SectionTitle title="Parts Margin" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <KPI label="Parts Revenue" value={fmt(data.parts.total_revenue)} />
                <KPI label="Parts Cost" value={fmt(data.parts.total_cost)} />
                <KPI label="Parts Profit" value={fmt(data.parts.total_profit)} color={data.parts.total_profit >= 0 ? 'text-success' : 'text-error'} />
                <KPI label="Markup" value={`${data.parts.markup_pct}%`} />
              </div>

              {data.parts.by_job.length > 0 && (
                <div className="bg-card border border-bdr rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bdr">
                        <TH>WO #</TH>
                        <TH>Job</TH>
                        <TH className="text-right">Revenue</TH>
                        <TH className="text-right">Cost</TH>
                        <TH className="text-right">Profit</TH>
                        <TH className="text-right">Margin</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parts.by_job.map((p, i) => (
                        <tr key={i} className="border-b border-bdr/50">
                          <TD><Link href={`/work-orders?open=${p.wo_id}`} className="text-xs font-mono text-accent hover:text-orange-400 transition">{p.wo_display_id}</Link></TD>
                          <TD><span className="text-sm text-slate-300 truncate max-w-[200px] block">{p.job}</span></TD>
                          <TD className="text-right text-sm text-slate-300">{fmt(p.revenue)}</TD>
                          <TD className="text-right text-sm text-slate-400">{p.cost > 0 ? fmt(p.cost) : <span className="text-slate-600">—</span>}</TD>
                          <TD className="text-right">
                            <span className={`text-sm font-medium ${p.profit >= 0 ? 'text-success' : 'text-error'}`}>{fmt(p.profit)}</span>
                          </TD>
                          <TD className="text-right">
                            {p.cost > 0 ? (
                              <span className={`text-sm ${p.margin_pct >= 30 ? 'text-success' : p.margin_pct >= 10 ? 'text-yellow-400' : 'text-error'}`}>
                                {p.margin_pct}%
                              </span>
                            ) : (
                              <span className="text-xs text-slate-600">no cost</span>
                            )}
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.parts.total_cost === 0 && data.parts.total_revenue > 0 && (
                <div className="mt-2 text-xs text-slate-600 flex items-center gap-1.5">
                  <Icon d={icons.alert} size={12} stroke="#64748b" />
                  No cost data — create purchase orders to track parts cost and see margin
                </div>
              )}
            </div>
          )}

          {/* ======================================================
              SECTION 5: JOB PROFITABILITY
              ====================================================== */}
          {data.jobs.length > 0 && (
            <div>
              <SectionTitle title={`Job Profitability (${data.completed_count} completed)`} />
              <div className="bg-card border border-bdr rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bdr">
                        <TH>WO #</TH>
                        <TH>Job</TH>
                        <TH>Customer</TH>
                        <TH className="text-right">Labor</TH>
                        <TH className="text-right">Parts</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Parts Cost</TH>
                        <TH className="text-right">Parts Profit</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map(j => (
                        <tr key={j.wo_id} className="border-b border-bdr/50">
                          <TD><Link href={`/work-orders?open=${j.wo_id}`} className="text-xs font-mono text-accent hover:text-orange-400 transition">{j.display_id}</Link></TD>
                          <TD><span className="text-sm text-slate-300 truncate max-w-[180px] block">{j.job}</span></TD>
                          <TD><span className="text-xs text-slate-400">{j.customer_name}</span></TD>
                          <TD className="text-right text-sm text-slate-300">{fmt(j.labor_revenue)}</TD>
                          <TD className="text-right text-sm text-slate-300">{fmt(j.parts_revenue)}</TD>
                          <TD className="text-right text-sm text-white font-medium">{fmt(j.total_revenue)}</TD>
                          <TD className="text-right text-sm text-slate-400">
                            {j.parts_cost > 0 ? fmt(j.parts_cost) : <span className="text-slate-600">—</span>}
                          </TD>
                          <TD className="text-right">
                            {j.parts_cost > 0 ? (
                              <span className={`text-sm font-medium ${j.parts_profit >= 0 ? 'text-success' : 'text-error'}`}>
                                {fmt(j.parts_profit)}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================
              SECTION 6: TOP SERVICES + STATUS
              ====================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Top Services */}
            {data.top_services.length > 0 && (
              <div className="bg-card border border-bdr rounded-xl p-5">
                <h3 className="font-heading font-bold text-white tracking-wide mb-4">Top Services</h3>
                <div className="space-y-3">
                  {(() => {
                    const maxCount = Math.max(...data.top_services.map(s => s.count), 1);
                    return data.top_services.map((s, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300 truncate max-w-[200px]">{s.job}</span>
                          <span className="text-slate-400">{s.count} jobs</span>
                        </div>
                        <div className="h-3 bg-bg rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-accent/60 transition-all" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Shop Status */}
            <div className="bg-card border border-bdr rounded-xl p-5">
              <h3 className="font-heading font-bold text-white tracking-wide mb-4">Shop Status</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Open Work Orders</span>
                  <span className="text-lg font-heading font-bold text-white">{data.open_work_orders}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Completed (period)</span>
                  <span className="text-lg font-heading font-bold text-success">{data.completed_count}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Low Stock Alerts</span>
                  <span className={`text-lg font-heading font-bold ${data.low_stock_count > 0 ? 'text-error' : 'text-white'}`}>{data.low_stock_count}</span>
                </div>
                {data.low_stock_count > 0 && (
                  <div className="bg-error/10 border border-error/30 rounded-lg p-2 flex items-center gap-2">
                    <Icon d={icons.alert} size={14} stroke="#ef4444" />
                    <span className="text-xs text-error">{data.low_stock_count} part(s) need restocking</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
function effColor(pct: number): string {
  if (pct >= 100) return 'text-success';
  if (pct >= 80) return 'text-yellow-400';
  return 'text-error';
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="font-heading font-bold text-lg text-white tracking-wide mb-3">{title}</h2>
  );
}

function KPI({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  return (
    <div className="bg-card border border-bdr rounded-xl p-4">
      <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-xl font-heading font-bold ${color || (accent ? 'text-accent' : 'text-white')}`}>{value}</div>
    </div>
  );
}
