import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

interface SearchResult {
  type: string;
  id: string;
  display_id?: string;
  label: string;
  subtitle: string;
  customer_id?: string;
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const q = (req.nextUrl.searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Escape SQL ILIKE wildcards to prevent unexpected matches
  const eq = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

  const results: SearchResult[] = [];

  // Run all queries in parallel
  const [
    customersRes,
    vehiclesPlateVinRes,
    vehiclesMakeModelRes,
    workOrdersRes,
    invoicesRes,
    estimatesRes,
    purchaseOrdersRes,
  ] = await Promise.all([
    // Customers — name, phone, email
    supabase
      .from('customers')
      .select('id, name, phone, email')
      .or(`name.ilike.%${eq}%,phone.ilike.%${eq}%,email.ilike.%${eq}%`)
      .limit(5),

    // Vehicles — plate, vin
    supabase
      .from('vehicles')
      .select('id, plate, vin, year, make, model, customer_id')
      .or(`plate.ilike.%${eq}%,vin.ilike.%${eq}%`)
      .limit(5),

    // Vehicles — make/model text search
    supabase
      .from('vehicles')
      .select('id, plate, vin, year, make, model, customer_id')
      .or(`make.ilike.%${eq}%,model.ilike.%${eq}%`)
      .limit(5),

    // Work Orders — display_id, job (with customer name join)
    supabase
      .from('work_orders')
      .select('id, display_id, job, customer:customers(name)')
      .or(`display_id.ilike.%${eq}%,job.ilike.%${eq}%`)
      .limit(5),

    // Invoices — display_id (with customer name join)
    supabase
      .from('invoices')
      .select('id, display_id, customer:customers(name)')
      .or(`display_id.ilike.%${eq}%`)
      .limit(5),

    // Estimates — display_id (with customer name join)
    supabase
      .from('estimates')
      .select('id, display_id, customer:customers(name)')
      .or(`display_id.ilike.%${eq}%`)
      .limit(5),

    // Purchase Orders — display_id (with vendor name join)
    supabase
      .from('purchase_orders')
      .select('id, display_id, vendor:vendors(name)')
      .or(`display_id.ilike.%${eq}%`)
      .limit(5),
  ]);

  // Customers
  if (customersRes.data) {
    for (const c of customersRes.data) {
      results.push({
        type: 'customer',
        id: c.id,
        label: c.name,
        subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info',
      });
    }
  }

  // Vehicles — merge plate/vin results with make/model results, deduplicate
  const vehicleMap = new Map<string, typeof vehiclesPlateVinRes.data extends (infer T)[] | null ? T : never>();
  for (const v of vehiclesPlateVinRes.data || []) {
    vehicleMap.set(v.id, v);
  }
  for (const v of vehiclesMakeModelRes.data || []) {
    vehicleMap.set(v.id, v);
  }
  const vehicles = Array.from(vehicleMap.values()).slice(0, 5);
  for (const v of vehicles) {
    results.push({
      type: 'vehicle',
      id: v.id,
      customer_id: v.customer_id,
      label: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle',
      subtitle: [v.plate, v.vin].filter(Boolean).join(' · ') || 'No plate/VIN',
    });
  }

  // Work Orders
  if (workOrdersRes.data) {
    for (const wo of workOrdersRes.data) {
      const customer = wo.customer as unknown as { name: string } | null;
      results.push({
        type: 'work_order',
        id: wo.id,
        display_id: wo.display_id,
        label: wo.display_id || 'Work Order',
        subtitle: [wo.job, customer?.name].filter(Boolean).join(' · ') || '',
      });
    }
  }

  // Invoices
  if (invoicesRes.data) {
    for (const inv of invoicesRes.data) {
      const customer = inv.customer as unknown as { name: string } | null;
      results.push({
        type: 'invoice',
        id: inv.id,
        display_id: inv.display_id,
        label: inv.display_id || 'Invoice',
        subtitle: customer?.name || '',
      });
    }
  }

  // Estimates
  if (estimatesRes.data) {
    for (const est of estimatesRes.data) {
      const customer = est.customer as unknown as { name: string } | null;
      results.push({
        type: 'estimate',
        id: est.id,
        display_id: est.display_id,
        label: est.display_id || 'Estimate',
        subtitle: customer?.name || '',
      });
    }
  }

  // Purchase Orders
  if (purchaseOrdersRes.data) {
    for (const po of purchaseOrdersRes.data) {
      const vendor = po.vendor as unknown as { name: string } | null;
      results.push({
        type: 'purchase_order',
        id: po.id,
        display_id: po.display_id,
        label: po.display_id || 'Purchase Order',
        subtitle: vendor?.name || '',
      });
    }
  }

  return NextResponse.json({ results });
}
