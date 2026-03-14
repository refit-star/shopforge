'use client';

import { useState, useEffect } from 'react';

interface MediaItem {
  id: string;
  url: string;
  annotated_url: string | null;
  media_type: string;
}

interface InspectionItem {
  id: string;
  category: string;
  item: string;
  status: string;
  notes: string | null;
  media: MediaItem[];
}

interface ShopInfo {
  shop_name: string;
  address: string;
  phone: string;
  email: string;
  logo_url: string | null;
}

interface DVIData {
  inspection: {
    id: string;
    created_at: string;
    items: InspectionItem[];
  };
  work_order: {
    display_id: string;
    customer: { id: string; name: string; phone?: string; email?: string } | null;
    vehicle: { year?: number; make: string; model: string; vin?: string; plate?: string } | null;
  };
  shop: ShopInfo | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  fail: { label: 'Needs Attention', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  attention: { label: 'Recommended', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  pass: { label: 'Passed', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
};

export default function InspectionPortalPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DVIData | null>(null);
  const [lightbox, setLightbox] = useState<MediaItem | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [showPassedItems, setShowPassedItems] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/portal/inspection/${token}`);
        if (!res.ok) {
          setError('Inspection not found. This link may be invalid or expired.');
          return;
        }
        setData(await res.json());
      } catch {
        setError('Something went wrong. Please try again later.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleApprove = async () => {
    if (selectedItems.size === 0) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/portal/inspection/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: Array.from(selectedItems) }),
      });
      if (res.ok) {
        setApproved(true);
      }
    } catch {
      // silent
    } finally {
      setApproving(false);
    }
  };

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (items: InspectionItem[]) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      items.forEach(i => next.add(i.id));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Loading inspection report...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Report Not Found</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const { inspection, work_order, shop } = data;
  const shopName = shop?.shop_name || 'ShopForge';
  const vehicleStr = work_order.vehicle
    ? `${work_order.vehicle.year || ''} ${work_order.vehicle.make} ${work_order.vehicle.model}`.trim()
    : '';

  // Group items by status (skip not_checked)
  const failItems = inspection.items.filter(i => i.status === 'fail');
  const attentionItems = inspection.items.filter(i => i.status === 'attention');
  const passItems = inspection.items.filter(i => i.status === 'pass');
  const actionableItems = [...failItems, ...attentionItems];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 sm:px-6">
          <div className="flex items-center gap-4">
            {shop?.logo_url && (
              <img src={shop.logo_url} alt={shopName} className="h-10 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{shopName}</h1>
              {shop?.address && (
                <p className="text-xs text-gray-500 mt-0.5">{shop.address}</p>
              )}
            </div>
          </div>
          {(shop?.phone || shop?.email) && (
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              {shop.phone && <span>{shop.phone}</span>}
              {shop.email && <span>{shop.email}</span>}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:px-6">
        {/* Title bar */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Vehicle Inspection Report</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            {vehicleStr && <span>{vehicleStr}</span>}
            {work_order.vehicle?.plate && <span>Plate: {work_order.vehicle.plate}</span>}
            <span>RO #{work_order.display_id}</span>
          </div>
          {work_order.customer?.name && (
            <p className="text-sm text-gray-600 mt-2">Prepared for: <span className="font-medium">{work_order.customer.name}</span></p>
          )}

          {/* Summary badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            {failItems.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                {failItems.length} Need{failItems.length > 1 ? '' : 's'} Attention
              </span>
            )}
            {attentionItems.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                {attentionItems.length} Recommended
              </span>
            )}
            {passItems.length > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                {passItems.length} Passed
              </span>
            )}
          </div>
        </div>

        {/* Approved confirmation */}
        {approved && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6 text-center">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-emerald-900 mb-1">Thank You!</h3>
            <p className="text-sm text-emerald-700">
              Your service advisor will contact you with a detailed estimate shortly.
            </p>
          </div>
        )}

        {/* Red items — Needs Immediate Attention */}
        {failItems.length > 0 && (
          <ItemSection
            title="Needs Immediate Attention"
            items={failItems}
            status="fail"
            selectable={!approved}
            selectedItems={selectedItems}
            onToggle={toggleItem}
            onSelectAll={() => selectAll(failItems)}
            onLightbox={setLightbox}
          />
        )}

        {/* Yellow items — Recommended Services */}
        {attentionItems.length > 0 && (
          <ItemSection
            title="Recommended Services"
            items={attentionItems}
            status="attention"
            selectable={!approved}
            selectedItems={selectedItems}
            onToggle={toggleItem}
            onSelectAll={() => selectAll(attentionItems)}
            onLightbox={setLightbox}
          />
        )}

        {/* Green items — Passed */}
        {passItems.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowPassedItems(!showPassedItems)}
              className="w-full flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-left hover:bg-emerald-100 transition"
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm font-semibold text-emerald-800">
                  Passed Inspection ({passItems.length} items)
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-emerald-600 transition-transform ${showPassedItems ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showPassedItems && (
              <div className="mt-2 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                {passItems.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <span className="text-sm text-gray-700">{item.item}</span>
                      <span className="text-xs text-gray-400 ml-2">{item.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!approved && actionableItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
            <button
              onClick={handleApprove}
              disabled={selectedItems.size === 0 || approving}
              className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-40 hover:bg-blue-700 transition"
            >
              {approving
                ? 'Submitting...'
                : selectedItems.size === 0
                  ? 'Select items above to approve'
                  : `Approve ${selectedItems.size} Selected Item${selectedItems.size > 1 ? 's' : ''}`
              }
            </button>
          </div>
        )}

        {/* Contact shop */}
        {shop?.phone && (
          <div className="text-center mb-8">
            <a
              href={`tel:${shop.phone}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-100 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call {shopName}
            </a>
          </div>
        )}
      </main>

      <Footer />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-[85vh] w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-gray-300 hover:text-white transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {lightbox.media_type === 'video' ? (
              <video src={lightbox.url} controls autoPlay className="w-full max-h-[85vh] rounded-lg" />
            ) : (
              <img
                src={lightbox.annotated_url || lightbox.url}
                alt=""
                className="w-full max-h-[85vh] object-contain rounded-lg"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Item Section (red/yellow groups) ── */
function ItemSection({
  title,
  items,
  status,
  selectable,
  selectedItems,
  onToggle,
  onSelectAll,
  onLightbox,
}: {
  title: string;
  items: InspectionItem[];
  status: string;
  selectable: boolean;
  selectedItems: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onLightbox: (m: MediaItem) => void;
}) {
  const cfg = STATUS_LABELS[status];
  const allSelected = items.every(i => selectedItems.has(i.id));

  // Group by category
  const grouped: Record<string, InspectionItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  return (
    <div className="mb-6">
      <div className={`flex items-center justify-between ${cfg.bg} border ${cfg.border} rounded-t-xl px-5 py-3`}>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${status === 'fail' ? 'bg-red-500' : 'bg-amber-500'}`} />
          <span className={`text-sm font-semibold ${cfg.color}`}>{title}</span>
          <span className={`text-xs ${cfg.color} opacity-70`}>({items.length})</span>
        </div>
        {selectable && items.length > 1 && (
          <button
            onClick={onSelectAll}
            className={`text-xs font-medium ${cfg.color} hover:underline`}
          >
            {allSelected ? 'All selected' : 'Select all'}
          </button>
        )}
      </div>

      <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl divide-y divide-gray-100">
        {Object.entries(grouped).map(([category, catItems]) => (
          <div key={category}>
            <div className="px-5 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{category}</span>
            </div>
            {catItems.map(item => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  {selectable && (
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={() => onToggle(item.id)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.item}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} ${cfg.border} border`}>
                        {cfg.label}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                    )}
                    {/* Photos */}
                    {item.media.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {item.media.map(m => (
                          <button
                            key={m.id}
                            onClick={() => onLightbox(m)}
                            className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition shrink-0"
                          >
                            {m.media_type === 'video' ? (
                              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            ) : (
                              <img
                                src={m.annotated_url || m.url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
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
