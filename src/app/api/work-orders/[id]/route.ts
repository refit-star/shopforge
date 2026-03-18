import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase-server';
import { internalError } from '@/lib/api-error';

function computeTotals(wo: Record<string, unknown>) {
  const laborLines = (wo.wo_labor_lines as { hours: number; rate: number }[]) || [];
  const partsLines = (wo.wo_parts_lines as { qty: number; price: number }[]) || [];

  const labor_total = laborLines.reduce((sum, l) => sum + Number(l.hours) * Number(l.rate), 0);
  const parts_total = partsLines.reduce((sum, p) => sum + Number(p.qty) * Number(p.price), 0);
  const labor_hours = laborLines.reduce((sum, l) => sum + Number(l.hours), 0);

  return {
    ...wo,
    labor_lines: laborLines,
    parts_lines: partsLines,
    labor_total: Math.round(labor_total * 100) / 100,
    parts_total: Math.round(parts_total * 100) / 100,
    estimated_total: Math.round((labor_total + parts_total) * 100) / 100,
    labor_hours: Math.round(labor_hours * 100) / 100,
  };
}

async function fetchFull(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer:customers(id, name, phone, email),
      vehicle:vehicles(id, year, make, model, vin, mileage, plate),
      tech:techs(id, name, color),
      wo_labor_lines(id, description, hours, rate, sort_order),
      wo_parts_lines(id, name, qty, price, sort_order, source, part_number, brand)
    `)
    .eq('id', id)
    .single();

  if (error) return { data: null, error };
  return { data: computeTotals(data), error: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data, error } = await fetchFull(supabase, id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();
  const body = await req.json();

  // Collect activity log entries
  const activityEntries: { work_order_id: string; action: string; details?: string }[] = [];

  // Update WO fields
  const allowedFields = ['status', 'tech_id', 'notes', 'priority', 'job', 'mileage_in', 'mileage_out', 'scheduled_date'];
  const updates: Record<string, unknown> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('work_orders')
      .update(updates)
      .eq('id', id);

    if (error) {
      return internalError(error);
    }
  }

  // Log status change
  if ('status' in body) {
    activityEntries.push({ work_order_id: id, action: `Status changed to ${body.status}` });
  }

  // Log tech assignment
  if ('tech_id' in body) {
    if (body.tech_id) {
      const { data: techData } = await supabase.from('techs').select('name').eq('id', body.tech_id).single();
      activityEntries.push({ work_order_id: id, action: `Technician changed to ${techData?.name || 'Unknown'}` });
    } else {
      activityEntries.push({ work_order_id: id, action: 'Technician unassigned' });
    }
  }

  // Log priority change
  if ('priority' in body) {
    activityEntries.push({ work_order_id: id, action: `Priority changed to ${body.priority}` });
  }

  // Log notes update
  if ('notes' in body) {
    activityEntries.push({ work_order_id: id, action: 'Notes updated' });
  }

  // Handle labor lines: replace all
  if ('labor_lines' in body && Array.isArray(body.labor_lines)) {
    // Delete existing
    await supabase.from('wo_labor_lines').delete().eq('work_order_id', id);

    // Insert new
    if (body.labor_lines.length > 0) {
      const rows = body.labor_lines.map((l: { description: string; hours: number; rate: number }, i: number) => ({
        work_order_id: id,
        description: l.description,
        hours: l.hours,
        rate: l.rate,
        sort_order: i,
      }));
      const { error } = await supabase.from('wo_labor_lines').insert(rows);
      if (error) {
        return internalError(error);
      }
    }
    activityEntries.push({ work_order_id: id, action: `Labor lines updated (${body.labor_lines.length} items)` });
  }

  // Handle parts lines: replace all
  if ('parts_lines' in body && Array.isArray(body.parts_lines)) {
    // Delete existing
    await supabase.from('wo_parts_lines').delete().eq('work_order_id', id);

    // Insert new
    if (body.parts_lines.length > 0) {
      const rows = body.parts_lines.map((p: { name: string; qty: number; price: number; source?: string; part_number?: string; brand?: string }, i: number) => ({
        work_order_id: id,
        name: p.name,
        qty: p.qty,
        price: p.price,
        sort_order: i,
        source: p.source || 'manual',
        part_number: p.part_number || null,
        brand: p.brand || null,
      }));
      const { error } = await supabase.from('wo_parts_lines').insert(rows);
      if (error) {
        return internalError(error);
      }
    }
    activityEntries.push({ work_order_id: id, action: `Parts lines updated (${body.parts_lines.length} items)` });
  }

  // Insert all activity log entries
  if (activityEntries.length > 0) {
    await supabase.from('wo_activity_log').insert(activityEntries);
  }

  // Update vehicle mileage if provided
  if ('mileage_in' in body || 'mileage_out' in body) {
    // Get the WO to find vehicle_id
    const { data: wo } = await supabase
      .from('work_orders')
      .select('vehicle_id')
      .eq('id', id)
      .single();

    if (wo?.vehicle_id && body.mileage_out) {
      await supabase
        .from('vehicles')
        .update({ mileage: body.mileage_out })
        .eq('id', wo.vehicle_id);
    }
  }

  // Auto-create notification + send SMS on status change
  if ('status' in body) {
    const STATUS_MESSAGES: Record<string, string> = {
      'Unscheduled': 'Your work order has been created. We will contact you to schedule.',
      'Scheduled': 'Your service appointment has been scheduled.',
      'Check-In': 'Your vehicle has been checked in.',
      'In Progress': 'Work has begun on your vehicle.',
      'Waiting on Parts': 'We are waiting on parts for your vehicle.',
      'Ready for Pickup': 'Your vehicle is ready for pickup!',
      'Completed': 'Service on your vehicle has been completed. Thank you!',
    };
    const msg = STATUS_MESSAGES[body.status];
    if (msg) {
      const { data: wo } = await supabase.from('work_orders').select('customer_id, display_id, vehicle:vehicles(year, make, model)').eq('id', id).single();
      if (wo) {
        await supabase.from('notifications').insert({
          work_order_id: id,
          customer_id: wo.customer_id,
          type: 'status_change',
          channel: 'sms',
          message: msg,
        });

        // Auto-SMS: send if template is enabled and Twilio is configured
        try {
          const { data: shop } = await supabase
            .from('shops')
            .select('id, name, twilio_phone_number, sms_auto_templates')
            .single();

          const templates = shop?.sms_auto_templates as Record<string, { enabled: boolean; template: string }> | null;
          const tpl = templates?.[body.status];

          // Fetch Twilio secrets from shop_secrets via admin client
          const { createAdminClient: createAdmin } = await import('@/lib/supabase-server');
          const admin = createAdmin();
          const { data: secrets } = shop ? await admin.from('shop_secrets').select('twilio_account_sid, twilio_auth_token').eq('shop_id', shop.id).single() : { data: null };

          if (
            tpl?.enabled &&
            tpl.template &&
            secrets?.twilio_account_sid &&
            secrets?.twilio_auth_token &&
            shop?.twilio_phone_number
          ) {
            // Fetch customer phone
            const { data: customer } = await supabase
              .from('customers')
              .select('id, phone')
              .eq('id', wo.customer_id)
              .single();

            if (customer?.phone) {
              // Render template
              const vehicleRaw = wo.vehicle as unknown;
              const vehicle = Array.isArray(vehicleRaw) ? vehicleRaw[0] as { year: number | null; make: string; model: string } | undefined : vehicleRaw as { year: number | null; make: string; model: string } | null;
              const vehicleStr = vehicle
                ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
                : 'your vehicle';

              const rendered = tpl.template
                .replace(/\{\{shop_name\}\}/g, shop.name || '')
                .replace(/\{\{vehicle\}\}/g, vehicleStr)
                .replace(/\{\{display_id\}\}/g, wo.display_id || '');

              // Send via Twilio
              const credentials = Buffer.from(
                `${secrets.twilio_account_sid}:${secrets.twilio_auth_token}`
              ).toString('base64');

              const smsParams = new URLSearchParams();
              smsParams.append('From', shop.twilio_phone_number);
              smsParams.append('To', customer.phone);
              smsParams.append('Body', rendered);

              const smsRes = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${secrets.twilio_account_sid}/Messages.json`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: smsParams.toString(),
                }
              );

              if (smsRes.ok) {
                const smsData = await smsRes.json();
                // Log to sms_messages
                await supabase.from('sms_messages').insert({
                  customer_id: customer.id,
                  direction: 'outbound',
                  phone_number: customer.phone,
                  body: rendered,
                  twilio_message_sid: smsData.sid,
                });
              }
            }
          }
        } catch {
          // Best-effort — don't block WO status update
        }
      }
    }

    // Decrement inventory stock on completion (best-effort)
    if (body.status === 'Completed') {
      try {
        // Fetch parts lines for this WO
        const { data: woPartsLines } = await supabase
          .from('wo_parts_lines')
          .select('name, qty')
          .eq('work_order_id', id);

        if (woPartsLines && woPartsLines.length > 0) {
          // Fetch all active inventory items
          const { data: inventoryItems } = await supabase
            .from('parts_inventory')
            .select('id, name, qty_on_hand')
            .eq('active', true);

          if (inventoryItems && inventoryItems.length > 0) {
            // Build a lookup map (lowercase name -> inventory item)
            const invMap = new Map<string, { id: string; qty_on_hand: number }>();
            for (const inv of inventoryItems) {
              invMap.set(inv.name.toLowerCase(), { id: inv.id, qty_on_hand: inv.qty_on_hand });
            }

            // Decrement stock for each matching part
            for (const part of woPartsLines) {
              const match = invMap.get(part.name.toLowerCase());
              if (match) {
                const newQty = Math.max(0, match.qty_on_hand - Number(part.qty));
                await supabase
                  .from('parts_inventory')
                  .update({ qty_on_hand: newQty })
                  .eq('id', match.id);
              }
            }
          }
        }
      } catch {
        // Best-effort — don't block WO completion if inventory update fails
      }
    }
  }

  // Return full updated WO
  const { data, error } = await fetchFull(supabase, id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return internalError(error);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Block deletion only if invoices exist (financial records)
  const { count: invCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('work_order_id', id);

  if (invCount && invCount > 0) {
    return NextResponse.json(
      { error: 'Cannot delete work order with existing invoices. Delete the invoice first.' },
      { status: 409 }
    );
  }

  // Clean up storage files for photos (best-effort)
  const { data: photos } = await supabase
    .from('wo_photos')
    .select('url')
    .eq('work_order_id', id);

  if (photos && photos.length > 0) {
    try {
      const paths = photos
        .map(p => p.url?.match(/\/wo-photos\/(.+)$/)?.[1])
        .filter(Boolean)
        .map(p => decodeURIComponent(p!));
      if (paths.length > 0) {
        const admin = createAdminClient();
        await admin.storage.from('wo-photos').remove(paths);
      }
    } catch {
      // Storage cleanup is best-effort
    }
  }

  // Delete related rows first
  // Clean up inspections and their media
  const { data: inspections } = await supabase.from('inspections').select('id').eq('work_order_id', id);
  if (inspections && inspections.length > 0) {
    const inspIds = inspections.map(i => i.id);
    // Get inspection items to clean up media
    const { data: items } = await supabase.from('inspection_items').select('id').in('inspection_id', inspIds);
    if (items && items.length > 0) {
      await supabase.from('inspection_item_media').delete().in('inspection_item_id', items.map(i => i.id));
    }
    await supabase.from('inspection_items').delete().in('inspection_id', inspIds);
    await supabase.from('inspections').delete().eq('work_order_id', id);
  }
  // Clean up time entries
  await supabase.from('time_entries').delete().eq('work_order_id', id);
  await supabase.from('wo_activity_log').delete().eq('work_order_id', id);
  await supabase.from('wo_labor_lines').delete().eq('work_order_id', id);
  await supabase.from('wo_parts_lines').delete().eq('work_order_id', id);
  await supabase.from('wo_photos').delete().eq('work_order_id', id);
  await supabase.from('notifications').delete().eq('work_order_id', id);

  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', id);

  if (error) {
    return internalError(error);
  }

  return NextResponse.json({ success: true });
}
