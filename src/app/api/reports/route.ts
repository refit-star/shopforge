import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  // Date range params (default: current month)
  const from = req.nextUrl.searchParams.get('from') || monthStart;
  const to = req.nextUrl.searchParams.get('to') || todayStr;
  const fromISO = `${from}T00:00:00`;
  const toISO = `${to}T23:59:59`;

  const [
    invoicesInRangeRes,
    allPaidRes,
    completedWOsRes,
    allWOsInRangeRes,
    timeEntriesRes,
    techsRes,
    openWoRes,
    partsInventoryRes,
    monthlyInvoicesRes,
  ] = await Promise.all([
    // Invoices in date range (all statuses)
    supabase
      .from('invoices')
      .select('id, status, total, labor_total, parts_total, tax, paid_at, created_at')
      .gte('created_at', fromISO)
      .lte('created_at', toISO),

    // All paid invoices (for dashboard compat + monthly trend)
    supabase
      .from('invoices')
      .select('total, labor_total, parts_total, tax, created_at')
      .eq('status', 'Paid'),

    // Completed WOs in range with labor + parts lines
    supabase
      .from('work_orders')
      .select(`
        id, display_id, job, tech_id, created_at, updated_at,
        customer:customers(name),
        wo_labor_lines(hours, rate),
        wo_parts_lines(name, qty, price, unit_cost)
      `)
      .eq('status', 'Completed')
      .gte('updated_at', fromISO)
      .lte('updated_at', toISO),

    // All WOs in range (for top services count)
    supabase
      .from('work_orders')
      .select('job')
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .not('job', 'is', null),

    // Time entries (job type, closed) in range
    supabase
      .from('time_entries')
      .select('tech_id, work_order_id, duration_minutes')
      .eq('type', 'job')
      .not('clock_out', 'is', null)
      .gte('clock_in', fromISO)
      .lte('clock_in', toISO),

    // All techs
    supabase.from('techs').select('id, name, color'),

    // Open work orders (global, not date-filtered)
    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'Completed'),

    // Parts inventory for low stock (global)
    supabase
      .from('parts_inventory')
      .select('qty_on_hand, min_stock, active'),

    // Paid invoices last 6 months for trend
    supabase
      .from('invoices')
      .select('total, labor_total, parts_total, created_at')
      .eq('status', 'Paid'),
  ]);

  // ============================================================
  // REVENUE SUMMARY
  // ============================================================
  const invoicesInRange = invoicesInRangeRes.data || [];
  const paidInRange = invoicesInRange.filter(i => i.status === 'Paid');
  const outstandingInRange = invoicesInRange.filter(i => i.status === 'Sent' || i.status === 'Overdue' || i.status === 'Draft');

  const revenue = {
    total: r2(paidInRange.reduce((s, i) => s + Number(i.total), 0)),
    labor: r2(paidInRange.reduce((s, i) => s + Number(i.labor_total), 0)),
    parts: r2(paidInRange.reduce((s, i) => s + Number(i.parts_total), 0)),
    tax: r2(paidInRange.reduce((s, i) => s + Number(i.tax), 0)),
    invoice_count: paidInRange.length,
    avg_ticket: paidInRange.length > 0
      ? r2(paidInRange.reduce((s, i) => s + Number(i.total), 0) / paidInRange.length)
      : 0,
    paid: r2(paidInRange.reduce((s, i) => s + Number(i.total), 0)),
    outstanding: r2(outstandingInRange.reduce((s, i) => s + Number(i.total), 0)),
  };

  // Monthly trend (always last 6 months)
  const monthlyMap: Record<string, { total: number; labor: number; parts: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = { total: 0, labor: 0, parts: 0 };
  }
  for (const inv of monthlyInvoicesRes.data || []) {
    const d = new Date(inv.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthlyMap) {
      monthlyMap[key].total += Number(inv.total);
      monthlyMap[key].labor += Number(inv.labor_total);
      monthlyMap[key].parts += Number(inv.parts_total);
    }
  }
  const monthly = Object.entries(monthlyMap).map(([month, v]) => ({
    month,
    total: r2(v.total),
    labor: r2(v.labor),
    parts: r2(v.parts),
  }));

  // ============================================================
  // LABOR PROFITABILITY
  // ============================================================
  const techs = techsRes.data || [];
  const completedWOs = completedWOsRes.data || [];
  const timeEntries = timeEntriesRes.data || [];

  // Billed hours + revenue per tech (from completed WO labor lines)
  const techBilled: Record<string, { hours: number; revenue: number }> = {};
  for (const wo of completedWOs) {
    const techId = wo.tech_id;
    if (!techId) continue;
    const lines = (wo.wo_labor_lines as { hours: number; rate: number }[]) || [];
    for (const l of lines) {
      if (!techBilled[techId]) techBilled[techId] = { hours: 0, revenue: 0 };
      techBilled[techId].hours += Number(l.hours);
      techBilled[techId].revenue += Number(l.hours) * Number(l.rate);
    }
  }

  // Actual hours per tech (from time_entries)
  const techActual: Record<string, number> = {};
  for (const te of timeEntries) {
    if (!te.tech_id || !te.duration_minutes) continue;
    techActual[te.tech_id] = (techActual[te.tech_id] || 0) + Number(te.duration_minutes) / 60;
  }

  let totalBilledHours = 0;
  let totalActualHours = 0;
  let totalBilledRevenue = 0;

  const laborTechs = techs.map(t => {
    const bh = r2(techBilled[t.id]?.hours || 0);
    const br = r2(techBilled[t.id]?.revenue || 0);
    const ah = r2(techActual[t.id] || 0);
    const eff = ah > 0 ? r2(bh / ah * 100) : 0;
    const effRate = ah > 0 ? r2(br / ah) : 0;
    totalBilledHours += bh;
    totalActualHours += ah;
    totalBilledRevenue += br;
    return {
      tech_id: t.id,
      tech_name: t.name,
      tech_color: t.color,
      billed_hours: bh,
      billed_revenue: br,
      actual_hours: ah,
      efficiency_pct: eff,
      effective_rate: effRate,
    };
  }).filter(t => t.billed_hours > 0 || t.actual_hours > 0);

  const labor = {
    techs: laborTechs,
    totals: {
      billed_hours: r2(totalBilledHours),
      actual_hours: r2(totalActualHours),
      billed_revenue: r2(totalBilledRevenue),
      efficiency_pct: totalActualHours > 0 ? r2(totalBilledHours / totalActualHours * 100) : 0,
    },
  };

  // ============================================================
  // PARTS MARGIN
  // ============================================================
  let partsTotalRevenue = 0;
  let partsTotalCost = 0;

  interface PartsByJobItem {
    wo_id: string;
    wo_display_id: string;
    job: string;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
  }
  const partsByJob: PartsByJobItem[] = [];

  for (const wo of completedWOs) {
    const pLines = (wo.wo_parts_lines as { name: string; qty: number; price: number; unit_cost: number | null }[]) || [];
    if (pLines.length === 0) continue;

    let jobRev = 0;
    let jobCost = 0;
    for (const p of pLines) {
      const rev = Number(p.qty) * Number(p.price);
      const cost = p.unit_cost != null ? Number(p.qty) * Number(p.unit_cost) : 0;
      jobRev += rev;
      jobCost += cost;
    }
    partsTotalRevenue += jobRev;
    partsTotalCost += jobCost;

    partsByJob.push({
      wo_id: wo.id,
      wo_display_id: wo.display_id,
      job: wo.job,
      revenue: r2(jobRev),
      cost: r2(jobCost),
      profit: r2(jobRev - jobCost),
      margin_pct: jobRev > 0 ? r2((jobRev - jobCost) / jobRev * 100) : 0,
    });
  }

  partsByJob.sort((a, b) => b.profit - a.profit);

  const parts = {
    total_revenue: r2(partsTotalRevenue),
    total_cost: r2(partsTotalCost),
    total_profit: r2(partsTotalRevenue - partsTotalCost),
    markup_pct: partsTotalCost > 0 ? r2((partsTotalRevenue - partsTotalCost) / partsTotalCost * 100) : 0,
    by_job: partsByJob.slice(0, 20),
  };

  // ============================================================
  // JOB PROFITABILITY
  // ============================================================
  // Actual hours per WO (from time_entries)
  const woActualHours: Record<string, number> = {};
  for (const te of timeEntries) {
    if (!te.work_order_id || !te.duration_minutes) continue;
    woActualHours[te.work_order_id] = (woActualHours[te.work_order_id] || 0) + Number(te.duration_minutes) / 60;
  }

  const jobs = completedWOs.map(wo => {
    const laborLines = (wo.wo_labor_lines as { hours: number; rate: number }[]) || [];
    const partsLines = (wo.wo_parts_lines as { qty: number; price: number; unit_cost: number | null }[]) || [];
    const customerRaw = wo.customer as unknown;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] as { name: string } | undefined : customerRaw as { name: string } | null;

    const laborRev = laborLines.reduce((s, l) => s + Number(l.hours) * Number(l.rate), 0);
    const partsRev = partsLines.reduce((s, p) => s + Number(p.qty) * Number(p.price), 0);
    const partsCost = partsLines.reduce((s, p) => s + (p.unit_cost != null ? Number(p.qty) * Number(p.unit_cost) : 0), 0);
    const totalRev = laborRev + partsRev;
    const partsProfit = partsRev - partsCost;

    return {
      wo_id: wo.id,
      display_id: wo.display_id,
      job: wo.job,
      customer_name: customer?.name || 'Unknown',
      completed_at: wo.updated_at,
      labor_revenue: r2(laborRev),
      parts_revenue: r2(partsRev),
      total_revenue: r2(totalRev),
      parts_cost: r2(partsCost),
      parts_profit: r2(partsProfit),
      margin_pct: totalRev > 0 ? r2(partsProfit / totalRev * 100) : 0,
    };
  }).sort((a, b) => b.total_revenue - a.total_revenue);

  // ============================================================
  // TOP SERVICES
  // ============================================================
  const jobCounts: Record<string, number> = {};
  for (const wo of allWOsInRangeRes.data || []) {
    if (wo.job) jobCounts[wo.job] = (jobCounts[wo.job] || 0) + 1;
  }
  const top_services = Object.entries(jobCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([job, count]) => ({ job, count }));

  // ============================================================
  // GLOBAL METRICS (not date-filtered)
  // ============================================================
  const open_work_orders = openWoRes.count || 0;

  const invParts = partsInventoryRes.data || [];
  const low_stock_count = invParts.filter(
    p => p.active === true && Number(p.qty_on_hand) <= Number(p.min_stock || 0)
  ).length;

  // Dashboard compat fields
  const allPaid = allPaidRes.data || [];
  const revenue_total = r2(allPaid.reduce((s, i) => s + Number(i.total), 0));
  const paidThisMonth = allPaid.filter(i => i.created_at >= `${monthStart}T00:00:00`);
  const revenue_this_month = r2(paidThisMonth.reduce((s, i) => s + Number(i.total), 0));

  return NextResponse.json({
    period: { from, to },
    revenue,
    monthly,
    labor,
    parts,
    jobs,
    top_services,
    open_work_orders,
    low_stock_count,
    completed_count: completedWOs.length,
    // Dashboard compat
    revenue_total,
    revenue_this_month,
    avg_ticket: revenue.avg_ticket,
    tech_hours: laborTechs.map(t => ({
      tech_name: t.tech_name,
      tech_color: t.tech_color,
      total_hours: t.billed_hours,
    })),
    monthly_revenue: monthly,
    parts_margin: parts.total_profit,
  });
}
