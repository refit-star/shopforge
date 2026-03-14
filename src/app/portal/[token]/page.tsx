'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import SignaturePadLib from 'signature_pad';

interface LaborLine {
  description: string;
  hours: number;
  rate: number;
}

interface PartsLine {
  name: string;
  qty: number;
  price: number;
}

interface EstimateSignature {
  signer_name: string;
  signature_url: string;
  approved_at: string;
}

interface PortalEstimate {
  display_id: string;
  job: string;
  notes: string | null;
  status: string;
  valid_until: string | null;
  created_at: string;
  customer?: { name: string; phone?: string; email?: string };
  vehicle?: { year?: number; make: string; model: string; vin?: string; plate?: string };
  labor_lines: LaborLine[];
  parts_lines: PartsLine[];
  labor_total: number;
  parts_total: number;
  estimated_total: number;
  signature?: EstimateSignature | null;
}

interface PortalInvoice {
  display_id: string;
  status: string;
  labor_total: number;
  parts_total: number;
  tax: number;
  total: number;
  payment_method: string | null;
  stripe_payment_link: string | null;
  paid_at: string | null;
  created_at: string;
  customer?: { name: string; phone?: string; email?: string };
  vehicle?: { year?: number; make: string; model: string; vin?: string; plate?: string };
  labor_lines: LaborLine[];
  parts_lines: PartsLine[];
}

interface ShopInfo {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string | null;
}

const fmt = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PortalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'estimate' | 'invoice' | null>(null);
  const [estimate, setEstimate] = useState<PortalEstimate | null>(null);
  const [invoice, setInvoice] = useState<PortalInvoice | null>(null);
  const [settings, setSettings] = useState<ShopInfo | null>(null);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const docRes = await fetch(`/api/portal/${token}`, { method: 'POST' });

        if (!docRes.ok) {
          setError('Document not found. This link may be invalid or expired.');
          setLoading(false);
          return;
        }

        const doc = await docRes.json();

        // Shop info is now included in the portal API response
        setSettings(doc.shop || null);
        setType(doc.type);

        if (doc.type === 'estimate') {
          setEstimate(doc.data);
          if (doc.data.status === 'Approved') setApproved(true);
        } else {
          setInvoice(doc.data);
        }
      } catch {
        setError('Something went wrong. Please try again later.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  const handleApprove = async (signerName: string, signatureData: string) => {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/portal/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer_name: signerName, signature_data: signatureData }),
      });
      if (res.ok) {
        const data = await res.json();
        setApproved(true);
        setEstimate((prev) => prev ? {
          ...prev,
          status: 'Approved',
          signature: {
            signer_name: signerName,
            signature_url: data.signature_url || '',
            approved_at: new Date().toISOString(),
          },
        } : prev);
      } else {
        const body = await res.json();
        setApproveError(body.error || 'Failed to approve estimate.');
      }
    } catch {
      setApproveError('Something went wrong. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading document...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Document Not Found</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const shopName = settings?.shop_name || 'ShopForge';
  const vehicleStr = (v?: { year?: number; make: string; model: string }) =>
    v ? `${v.year || ''} ${v.make} ${v.model}`.trim() : '';

  return (
    <div className="h-screen overflow-y-auto bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 sm:px-6">
          <div className="flex items-center gap-4">
            {settings?.logo_url && (
              <img src={settings.logo_url} alt={shopName} className="h-10 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{shopName}</h1>
              {settings?.address && (
                <p className="text-xs text-gray-500 mt-0.5">{settings.address}</p>
              )}
            </div>
          </div>
          {(settings?.phone || settings?.email) && (
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              {settings.phone && <span>{settings.phone}</span>}
              {settings.email && <span>{settings.email}</span>}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        {type === 'estimate' && estimate && (
          <EstimateView
            estimate={estimate}
            onApprove={handleApprove}
            approving={approving}
            approved={approved}
            approveError={approveError}
            vehicleStr={vehicleStr}
            token={token}
          />
        )}

        {type === 'invoice' && invoice && (
          <InvoiceView invoice={invoice} vehicleStr={vehicleStr} />
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ── Estimate View ── */
function EstimateView({
  estimate,
  onApprove,
  approving,
  approved,
  approveError,
  vehicleStr,
  token,
}: {
  estimate: PortalEstimate;
  onApprove: (signerName: string, signatureData: string) => void;
  approving: boolean;
  approved: boolean;
  approveError: string | null;
  vehicleStr: (v?: { year?: number; make: string; model: string }) => string;
  token: string;
}) {
  const [showSigning, setShowSigning] = useState(false);
  const [signerName, setSignerName] = useState(estimate.customer?.name || '');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    if (!showSigning || !canvasRef.current || padRef.current) return;
    padRef.current = new SignaturePadLib(canvasRef.current, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    });
    return () => {
      padRef.current?.off();
      padRef.current = null;
    };
  }, [showSigning]);

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    Sent: 'bg-blue-50 text-blue-700',
    Approved: 'bg-green-50 text-green-700',
    Declined: 'bg-red-50 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Estimate {estimate.display_id}</h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[estimate.status] || 'bg-gray-100 text-gray-700'}`}>
              {estimate.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created {new Date(estimate.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {estimate.valid_until && (
              <span> &middot; Valid until {new Date(estimate.valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            )}
          </p>
        </div>
      </div>

      {/* Customer & Vehicle info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          <div className="p-4 sm:p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Customer</div>
            <div className="text-sm font-medium text-gray-900">{estimate.customer?.name || '--'}</div>
            {estimate.customer?.phone && <div className="text-xs text-gray-500 mt-0.5">{estimate.customer.phone}</div>}
            {estimate.customer?.email && <div className="text-xs text-gray-500">{estimate.customer.email}</div>}
          </div>
          <div className="p-4 sm:p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Vehicle</div>
            <div className="text-sm font-medium text-gray-900">{vehicleStr(estimate.vehicle) || '--'}</div>
            {estimate.vehicle?.vin && <div className="text-xs text-gray-500 mt-0.5">VIN: {estimate.vehicle.vin}</div>}
            {estimate.vehicle?.plate && <div className="text-xs text-gray-500">Plate: {estimate.vehicle.plate}</div>}
          </div>
        </div>
      </div>

      {/* Service description */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Service</div>
        <div className="text-sm text-gray-900">{estimate.job}</div>
        {estimate.notes && <p className="text-xs text-gray-500 mt-2">{estimate.notes}</p>}
      </div>

      {/* Labor lines */}
      {estimate.labor_lines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {estimate.labor_lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{l.description}</div>
                  <div className="text-xs text-gray-400">{l.hours} hrs x {fmt(l.rate)}/hr</div>
                </div>
                <div className="text-sm font-medium text-gray-900 ml-4">{fmt(l.hours * l.rate)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parts lines */}
      {estimate.parts_lines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parts</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {estimate.parts_lines.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-400">Qty: {p.qty} x {fmt(p.price)}</div>
                </div>
                <div className="text-sm font-medium text-gray-900 ml-4">{fmt(p.qty * p.price)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Labor Subtotal</span>
            <span className="text-gray-700">{fmt(estimate.labor_total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Parts Subtotal</span>
            <span className="text-gray-700">{fmt(estimate.parts_total)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-gray-900">Estimated Total</span>
              <span className="text-xl font-bold text-gray-900">{fmt(estimate.estimated_total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Approve button — opens signature step */}
      {(estimate.status === 'Sent' || estimate.status === 'Draft') && !approved && !showSigning && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              By approving this estimate, you authorize the shop to proceed with the described services.
            </p>
            <button
              onClick={() => setShowSigning(true)}
              className="w-full sm:w-auto px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-sm transition text-sm"
            >
              Approve Estimate
            </button>
          </div>
        </div>
      )}

      {/* Signature capture step */}
      {showSigning && !approved && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Sign to Authorize</h3>
          <p className="text-sm text-gray-500 mb-4">
            Please sign below to approve this estimate and authorize the shop to proceed.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name (printed)</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
              <canvas
                ref={canvasRef}
                width={500}
                height={180}
                className="border border-gray-300 rounded-lg cursor-crosshair touch-none w-full"
                style={{ height: '180px' }}
              />
              <button
                type="button"
                onClick={() => padRef.current?.clear()}
                className="mt-1 text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Clear signature
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSigning(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (!signerName.trim()) return;
                  if (!padRef.current || padRef.current.isEmpty()) return;
                  const data = padRef.current.toDataURL('image/png');
                  onApprove(signerName.trim(), data);
                }}
                disabled={approving || !signerName.trim()}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-lg text-sm transition"
              >
                {approving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing...
                  </span>
                ) : (
                  'Sign & Approve'
                )}
              </button>
            </div>

            {approveError && (
              <p className="text-sm text-red-600 text-center">{approveError}</p>
            )}
          </div>
        </div>
      )}

      {/* Approved confirmation with signature */}
      {approved && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-green-800">Estimate Approved & Signed</div>
              <div className="text-xs text-green-600">The shop has been notified and will begin work as scheduled.</div>
            </div>
          </div>

          {estimate.signature && (
            <div className="bg-white rounded-lg border border-green-200 p-4 space-y-2">
              {estimate.signature.signature_url && (
                <img
                  src={estimate.signature.signature_url}
                  alt="Customer signature"
                  className="max-h-20 border-b border-gray-200 pb-2"
                />
              )}
              <div className="text-sm text-gray-700 font-medium">{estimate.signature.signer_name}</div>
              <div className="text-xs text-gray-500">
                Signed on {new Date(estimate.signature.approved_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </div>
            </div>
          )}

          <div className="mt-3 text-center">
            <a
              href={`/api/portal/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 hover:text-green-800 underline"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Signed Estimate (PDF)
            </a>
          </div>
        </div>
      )}

      {/* Declined state */}
      {estimate.status === 'Declined' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-red-800">Estimate Declined</div>
              <div className="text-xs text-red-600">This estimate has been declined. Contact the shop if you have questions.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Invoice View ── */
function InvoiceView({
  invoice,
  vehicleStr,
}: {
  invoice: PortalInvoice;
  vehicleStr: (v?: { year?: number; make: string; model: string }) => string;
}) {
  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-700',
    Sent: 'bg-blue-50 text-blue-700',
    Paid: 'bg-green-50 text-green-700',
    Overdue: 'bg-red-50 text-red-700',
    Void: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="space-y-6">
      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">Invoice {invoice.display_id}</h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[invoice.status] || 'bg-gray-100 text-gray-700'}`}>
              {invoice.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Issued {new Date(invoice.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            {invoice.paid_at && (
              <span> &middot; Paid {new Date(invoice.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            )}
          </p>
        </div>
      </div>

      {/* Customer & Vehicle info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
          <div className="p-4 sm:p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Customer</div>
            <div className="text-sm font-medium text-gray-900">{invoice.customer?.name || '--'}</div>
            {invoice.customer?.phone && <div className="text-xs text-gray-500 mt-0.5">{invoice.customer.phone}</div>}
            {invoice.customer?.email && <div className="text-xs text-gray-500">{invoice.customer.email}</div>}
          </div>
          <div className="p-4 sm:p-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Vehicle</div>
            <div className="text-sm font-medium text-gray-900">{vehicleStr(invoice.vehicle) || '--'}</div>
            {invoice.vehicle?.vin && <div className="text-xs text-gray-500 mt-0.5">VIN: {invoice.vehicle.vin}</div>}
            {invoice.vehicle?.plate && <div className="text-xs text-gray-500">Plate: {invoice.vehicle.plate}</div>}
          </div>
        </div>
      </div>

      {/* Labor lines */}
      {invoice.labor_lines && invoice.labor_lines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {invoice.labor_lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{l.description}</div>
                  <div className="text-xs text-gray-400">{l.hours} hrs x {fmt(l.rate)}/hr</div>
                </div>
                <div className="text-sm font-medium text-gray-900 ml-4">{fmt(l.hours * l.rate)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parts lines */}
      {invoice.parts_lines && invoice.parts_lines.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parts</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {invoice.parts_lines.map((p, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{p.name}</div>
                  <div className="text-xs text-gray-400">Qty: {p.qty} x {fmt(p.price)}</div>
                </div>
                <div className="text-sm font-medium text-gray-900 ml-4">{fmt(p.qty * p.price)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Labor Subtotal</span>
            <span className="text-gray-700">{fmt(invoice.labor_total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Parts Subtotal</span>
            <span className="text-gray-700">{fmt(invoice.parts_total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tax</span>
            <span className="text-gray-700">{fmt(invoice.tax)}</span>
          </div>
          <div className="border-t border-gray-200 pt-2 mt-2">
            <div className="flex justify-between">
              <span className="text-base font-semibold text-gray-900">Total</span>
              <span className="text-xl font-bold text-gray-900">{fmt(invoice.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment status */}
      {invoice.status === 'Paid' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-green-800">Payment Received</div>
              <div className="text-xs text-green-600">
                {invoice.payment_method && `Paid via ${invoice.payment_method}`}
                {invoice.paid_at && ` on ${new Date(invoice.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {invoice.status === 'Overdue' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-red-800">Payment Overdue</div>
              <div className="text-xs text-red-600">Please contact the shop to arrange payment.</div>
            </div>
          </div>
        </div>
      )}

      {/* Pay online button for Stripe */}
      {invoice.stripe_payment_link && invoice.status !== 'Paid' && invoice.status !== 'Void' && (
        <div className="text-center">
          <a
            href={invoice.stripe_payment_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            Pay Online
          </a>
        </div>
      )}

      {invoice.status === 'Void' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-600">Invoice Voided</div>
              <div className="text-xs text-gray-400">This invoice has been voided. Contact the shop with any questions.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Footer ── */
function Footer() {
  return (
    <footer className="py-8 text-center">
      <p className="text-xs text-gray-400">
        Powered by{' '}
        <a href={process.env.NEXT_PUBLIC_APP_URL || '/'} className="text-gray-500 hover:text-gray-700 font-medium transition" target="_blank" rel="noopener noreferrer">
          ShopForge
        </a>
      </p>
    </footer>
  );
}
