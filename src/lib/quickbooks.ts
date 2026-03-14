import { createAdminClient } from '@/lib/supabase-server';

// ---------------------------------------------------------------------------
// QuickBooks Online API Client — best-effort sync, never throws
// ---------------------------------------------------------------------------

const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
function getQBApiBase() {
  return process.env.QB_SANDBOX?.trim() === 'true'
    ? 'https://sandbox-quickbooks.api.intuit.com/v3/company'
    : 'https://quickbooks.api.intuit.com/v3/company';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShopQBFields {
  id: string;
  qb_access_token: string;
  qb_refresh_token: string;
  qb_token_expires_at: string; // ISO timestamp
  qb_realm_id: string;
}

interface QBCustomerInput {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  qb_customer_id: string | null;
}

interface QBInvoiceInput {
  display_id: string;
  created_at: string;
  labor_lines: { description: string; hours: number; rate: number }[];
  parts_lines: { name: string; qty: number; price: number }[];
  tax: number;
  total: number;
  qb_customer_id: string;
}

interface QBResult<T = Record<string, string>> {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

interface CustomerSyncResult extends QBResult {
  qb_customer_id?: string;
}

interface InvoiceSyncResult extends QBResult {
  qb_invoice_id?: string;
}

type PaymentSyncResult = QBResult;

// ---------------------------------------------------------------------------
// Helper: authenticated QB fetch wrapper
// ---------------------------------------------------------------------------

async function qbFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[QB] API error:', res.status, url.split('?')[0], JSON.stringify(data?.Fault || data));
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    console.error('[QB] fetch exception:', url.split('?')[0], err.message);
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Returns a valid access token for the shop. If the current token is expired
 * (or within 5 minutes of expiry), it is refreshed via Intuit OAuth2 and the
 * shops table is updated.
 */
export async function getAccessToken(
  shop: ShopQBFields,
): Promise<{ accessToken: string | null; error?: string }> {
  try {
    const expiresAt = new Date(shop.qb_token_expires_at).getTime();
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;

    // Token is still valid — return as-is
    if (expiresAt - now > fiveMin) {
      return { accessToken: shop.qb_access_token };
    }

    // Refresh the token
    const clientId = process.env.QB_CLIENT_ID;
    const clientSecret = process.env.QB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { accessToken: null, error: 'QB_CLIENT_ID or QB_CLIENT_SECRET not configured' };
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: shop.qb_refresh_token,
      }).toString(),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.access_token) {
      return {
        accessToken: null,
        error: `Token refresh failed: ${body?.error || res.statusText}`,
      };
    }

    // Compute new expiry (Intuit returns expires_in in seconds)
    const newExpiresAt = new Date(
      Date.now() + (body.expires_in ?? 3600) * 1000,
    ).toISOString();

    // Persist the refreshed tokens
    const supabase = createAdminClient();
    const { error: updateError } = await supabase
      .from('shops')
      .update({
        qb_access_token: body.access_token,
        qb_refresh_token: body.refresh_token ?? shop.qb_refresh_token,
        qb_token_expires_at: newExpiresAt,
      })
      .eq('id', shop.id);

    if (updateError) {
      // Token was refreshed but we failed to persist — still usable this request
      console.error('[QB] Failed to persist refreshed token:', updateError.message);
    }

    return { accessToken: body.access_token };
  } catch (err: any) {
    return { accessToken: null, error: `Token error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Customer sync
// ---------------------------------------------------------------------------

/**
 * Ensures a ShopForge customer exists in QuickBooks. Returns the QB customer ID.
 *
 * 1. If `qb_customer_id` is already set, return it (already synced).
 * 2. Query QB by email — if a match exists, return that ID.
 * 3. Otherwise create a new QB Customer and return the new ID.
 */
export async function syncCustomer(
  accessToken: string,
  realmId: string,
  customer: QBCustomerInput,
): Promise<CustomerSyncResult> {
  try {
    // Already synced
    if (customer.qb_customer_id) {
      return { success: true, qb_customer_id: customer.qb_customer_id };
    }

    // Try to find by email
    if (customer.email) {
      const escaped = customer.email.replace(/'/g, "\\'");
      const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr='${escaped}'`;
      const queryUrl = `${getQBApiBase()}/${realmId}/query?query=${encodeURIComponent(query)}`;

      const { ok, data } = await qbFetch(queryUrl, accessToken);

      if (ok && data?.QueryResponse?.Customer?.length) {
        const qbId = String(data.QueryResponse.Customer[0].Id);
        return { success: true, qb_customer_id: qbId };
      }
    }

    // Create new customer in QB
    const payload: Record<string, any> = {
      DisplayName: customer.name,
    };

    if (customer.email) {
      payload.PrimaryEmailAddr = { Address: customer.email };
    }
    if (customer.phone) {
      payload.PrimaryPhone = { FreeFormNumber: customer.phone };
    }
    if (customer.address || customer.city || customer.state || customer.zip) {
      payload.BillAddr = {
        Line1: customer.address || '',
        City: customer.city || '',
        CountrySubDivisionCode: customer.state || '',
        PostalCode: customer.zip || '',
      };
    }

    const createUrl = `${getQBApiBase()}/${realmId}/customer`;
    const { ok, data } = await qbFetch(createUrl, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.Customer?.Id) {
      const msg =
        data?.Fault?.Error?.[0]?.Detail ||
        data?.Fault?.Error?.[0]?.Message ||
        'Unknown QB error';
      return { success: false, error: `Failed to create QB customer: ${msg}` };
    }

    return { success: true, qb_customer_id: String(data.Customer.Id) };
  } catch (err: any) {
    return { success: false, error: `Customer sync error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Invoice sync
// ---------------------------------------------------------------------------

/**
 * Creates an invoice in QuickBooks from ShopForge invoice data.
 */
export async function syncInvoice(
  accessToken: string,
  realmId: string,
  invoice: QBInvoiceInput,
): Promise<InvoiceSyncResult> {
  try {
    const lines: any[] = [];

    // Map labor lines
    for (const labor of invoice.labor_lines) {
      lines.push({
        DetailType: 'SalesItemLineDetail',
        Amount: +(labor.hours * labor.rate).toFixed(2),
        Description: labor.description,
        SalesItemLineDetail: {
          UnitPrice: labor.rate,
          Qty: labor.hours,
        },
      });
    }

    // Map parts lines
    for (const part of invoice.parts_lines) {
      lines.push({
        DetailType: 'SalesItemLineDetail',
        Amount: +(part.qty * part.price).toFixed(2),
        Description: part.name,
        SalesItemLineDetail: {
          UnitPrice: part.price,
          Qty: part.qty,
        },
      });
    }

    const txnDate = invoice.created_at
      ? new Date(invoice.created_at).toISOString().split('T')[0]
      : undefined;

    const payload: Record<string, any> = {
      CustomerRef: { value: invoice.qb_customer_id },
      DocNumber: invoice.display_id,
      Line: lines,
      TxnTaxDetail: { TotalTax: invoice.tax },
    };

    if (txnDate) {
      payload.TxnDate = txnDate;
    }

    const url = `${getQBApiBase()}/${realmId}/invoice`;
    const { ok, data } = await qbFetch(url, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.Invoice?.Id) {
      const msg =
        data?.Fault?.Error?.[0]?.Detail ||
        data?.Fault?.Error?.[0]?.Message ||
        'Unknown QB error';
      return { success: false, error: `Failed to create QB invoice: ${msg}` };
    }

    return { success: true, qb_invoice_id: String(data.Invoice.Id) };
  } catch (err: any) {
    return { success: false, error: `Invoice sync error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// Payment sync
// ---------------------------------------------------------------------------

/**
 * Records a payment against a QuickBooks invoice.
 */
export async function syncPayment(
  accessToken: string,
  realmId: string,
  qbInvoiceId: string,
  amount: number,
  paymentMethod: string | null,
): Promise<PaymentSyncResult> {
  try {
    // First, fetch the invoice to get the CustomerRef
    const invoiceUrl = `${getQBApiBase()}/${realmId}/invoice/${qbInvoiceId}`;
    const { ok: invOk, data: invData } = await qbFetch(invoiceUrl, accessToken);

    if (!invOk || !invData?.Invoice?.CustomerRef?.value) {
      return {
        success: false,
        error: 'Failed to fetch QB invoice for payment — could not resolve customer',
      };
    }

    const customerRefValue = invData.Invoice.CustomerRef.value;

    const payload: Record<string, any> = {
      TotalAmt: amount,
      CustomerRef: { value: customerRefValue },
      Line: [
        {
          Amount: amount,
          LinkedTxn: [
            {
              TxnId: qbInvoiceId,
              TxnType: 'Invoice',
            },
          ],
        },
      ],
    };

    if (paymentMethod) {
      payload.PaymentMethodRef = { name: paymentMethod };
    }

    const url = `${getQBApiBase()}/${realmId}/payment`;
    const { ok, data } = await qbFetch(url, accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!ok || !data?.Payment?.Id) {
      const msg =
        data?.Fault?.Error?.[0]?.Detail ||
        data?.Fault?.Error?.[0]?.Message ||
        'Unknown QB error';
      return { success: false, error: `Failed to create QB payment: ${msg}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Payment sync error: ${err.message}` };
  }
}

// ---------------------------------------------------------------------------
// High-level orchestrators — called from invoice routes
// ---------------------------------------------------------------------------

/**
 * Syncs an invoice to QuickBooks when it's marked as Sent.
 * Handles: get shop QB creds → refresh token → sync customer → sync invoice.
 * Best-effort: logs errors to qb_sync_error, never throws.
 */
export async function syncInvoiceToQB(
  invoiceId: string,
  shopId: string,
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // Get shop QB credentials
    const { data: shop } = await supabase
      .from('shops')
      .select('id, qb_realm_id, qb_access_token, qb_refresh_token, qb_token_expires_at')
      .eq('id', shopId)
      .single();

    if (!shop?.qb_realm_id || !shop?.qb_access_token) return;

    // Get a valid access token
    const { accessToken, error: tokenError } = await getAccessToken(shop as ShopQBFields);
    if (!accessToken) {
      await supabase.from('invoices').update({ qb_sync_error: tokenError }).eq('id', invoiceId);
      return;
    }

    // Fetch full invoice with customer and line items
    const { data: invoice } = await supabase
      .from('invoices')
      .select(`
        id, display_id, created_at, tax, total, customer_id, qb_invoice_id,
        customer:customers(id, name, email, phone, address, city, state, zip, qb_customer_id),
        invoice_labor_lines(description, hours, rate),
        invoice_parts_lines(name, qty, price)
      `)
      .eq('id', invoiceId)
      .single();

    if (!invoice || invoice.qb_invoice_id) return;

    const customer = Array.isArray(invoice.customer) ? invoice.customer[0] : invoice.customer;
    if (!customer) return;

    // Sync customer first
    const custResult = await syncCustomer(accessToken, shop.qb_realm_id, customer as QBCustomerInput);
    if (!custResult.success || !custResult.qb_customer_id) {
      await supabase.from('invoices').update({ qb_sync_error: custResult.error }).eq('id', invoiceId);
      return;
    }

    // Persist QB customer ID if newly created
    if (!customer.qb_customer_id && custResult.qb_customer_id) {
      await supabase.from('customers').update({ qb_customer_id: custResult.qb_customer_id }).eq('id', customer.id);
    }

    // Sync invoice
    const invResult = await syncInvoice(accessToken, shop.qb_realm_id, {
      display_id: invoice.display_id,
      created_at: invoice.created_at,
      labor_lines: (invoice.invoice_labor_lines || []) as { description: string; hours: number; rate: number }[],
      parts_lines: (invoice.invoice_parts_lines || []) as { name: string; qty: number; price: number }[],
      tax: Number(invoice.tax),
      total: Number(invoice.total),
      qb_customer_id: custResult.qb_customer_id,
    });

    if (invResult.success && invResult.qb_invoice_id) {
      await supabase.from('invoices').update({ qb_invoice_id: invResult.qb_invoice_id, qb_sync_error: null }).eq('id', invoiceId);
    } else {
      await supabase.from('invoices').update({ qb_sync_error: invResult.error }).eq('id', invoiceId);
    }
  } catch (err: any) {
    console.error('[QB] syncInvoiceToQB:', err.message);
    try { await supabase.from('invoices').update({ qb_sync_error: err.message }).eq('id', invoiceId); } catch { /* best-effort */ }
  }
}

/**
 * Syncs a payment to QuickBooks when an invoice is marked Paid.
 * If the invoice hasn't been synced yet, syncs it first.
 * Best-effort: logs errors, never throws.
 */
export async function syncPaymentToQB(
  invoiceId: string,
  shopId: string,
  paymentMethod: string | null,
): Promise<void> {
  const supabase = createAdminClient();

  try {
    const { data: shop } = await supabase
      .from('shops')
      .select('id, qb_realm_id, qb_access_token, qb_refresh_token, qb_token_expires_at')
      .eq('id', shopId)
      .single();

    if (!shop?.qb_realm_id || !shop?.qb_access_token) return;

    const { accessToken, error: tokenError } = await getAccessToken(shop as ShopQBFields);
    if (!accessToken) {
      await supabase.from('invoices').update({ qb_sync_error: tokenError }).eq('id', invoiceId);
      return;
    }

    // Get invoice — need qb_invoice_id and total
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, display_id, created_at, tax, total, shop_id, customer_id, qb_invoice_id, customer:customers(id, name, email, phone, address, city, state, zip, qb_customer_id), invoice_labor_lines(description, hours, rate), invoice_parts_lines(name, qty, price)')
      .eq('id', invoiceId)
      .single();

    if (!invoice) return;

    let qbInvoiceId = invoice.qb_invoice_id;

    // If invoice hasn't been synced to QB yet, sync it first
    if (!qbInvoiceId) {
      await syncInvoiceToQB(invoiceId, shopId);
      // Re-fetch to get the qb_invoice_id
      const { data: updated } = await supabase
        .from('invoices')
        .select('qb_invoice_id')
        .eq('id', invoiceId)
        .single();
      qbInvoiceId = updated?.qb_invoice_id;
    }

    if (!qbInvoiceId) return; // Invoice sync failed — error already logged

    // Sync the payment
    const payResult = await syncPayment(
      accessToken,
      shop.qb_realm_id,
      qbInvoiceId,
      Number(invoice.total),
      paymentMethod,
    );

    if (!payResult.success) {
      await supabase.from('invoices').update({ qb_sync_error: payResult.error }).eq('id', invoiceId);
    } else {
      await supabase.from('invoices').update({ qb_sync_error: null }).eq('id', invoiceId);
    }
  } catch (err: any) {
    try { await supabase.from('invoices').update({ qb_sync_error: err.message }).eq('id', invoiceId); } catch { /* best-effort */ }
  }
}
