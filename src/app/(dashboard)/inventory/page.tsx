'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { EmptyState } from '@/components/ui/EmptyState';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import type { PartInventory, Vendor } from '@/lib/types';

const CATEGORIES = ['Brakes', 'Engine', 'Electrical', 'Suspension', 'Fluids', 'Filters', 'Belts & Hoses', 'Body', 'Tires', 'Other'];

export default function InventoryPage() {
  return <Suspense fallback={null}><InventoryContent /></Suspense>;
}

function InventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [parts, setParts] = useState<PartInventory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editPart, setEditPart] = useState<PartInventory | null>(null);
  const [search, setSearch] = useState('');

  const fetchParts = async () => {
    const data = await fetch('/api/parts-inventory').then(r => r.json());
    setParts(data);
    setLoaded(true);
  };

  useEffect(() => {
    fetchParts();
    fetch('/api/vendors').then(r => r.json()).then(d => { if (Array.isArray(d)) setVendors(d); });
    if (searchParams.get('filter') === 'low-stock') setShowLowOnly(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = parts.filter(p => {
    if (showLowOnly && p.qty_on_hand > p.min_stock) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.part_number || '').toLowerCase().includes(q);
    }
    return true;
  });

  const lowStock = parts.filter(p => p.qty_on_hand <= p.min_stock);
  const totalValue = parts.reduce((s, p) => s + p.qty_on_hand * p.cost, 0);
  const totalRetail = parts.reduce((s, p) => s + p.qty_on_hand * p.price, 0);

  const deletePart = async (id: string) => {
    await fetch(`/api/parts-inventory/${id}`, { method: 'DELETE' });
    await fetchParts();
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="space-y-5">
      {/* Parts Navigation */}
      <div className="flex gap-1 bg-card border border-bdr rounded-lg p-1 mb-4">
        <button className="px-4 py-1.5 rounded-md text-sm font-heading font-semibold bg-accent/15 text-accent">
          Inventory
        </button>
        <button
          onClick={() => router.push('/purchase-orders')}
          className="px-4 py-1.5 rounded-md text-sm font-heading font-semibold text-slate-500 hover:text-slate-300 transition"
        >
          Purchase Orders
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-white tracking-wide">Parts Inventory</h1>
        <Btn onClick={() => setShowNew(true)}>
          <span className="flex items-center gap-2"><Icon d={icons.plus} size={16} />Add Part</span>
        </Btn>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-bdr rounded-xl p-4">
          <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Parts</div>
          <div className="text-2xl font-heading font-bold text-white">{parts.length}</div>
        </div>
        <div className="bg-card border border-bdr rounded-xl p-4">
          <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Low Stock</div>
          <div className={`text-2xl font-heading font-bold ${lowStock.length > 0 ? 'text-error' : 'text-white'}`}>{lowStock.length}</div>
        </div>
        <div className="bg-card border border-bdr rounded-xl p-4">
          <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Inventory Cost</div>
          <div className="text-2xl font-heading font-bold text-white">{fmt(totalValue)}</div>
        </div>
        <div className="bg-card border border-bdr rounded-xl p-4">
          <div className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Retail Value</div>
          <div className="text-2xl font-heading font-bold text-accent">{fmt(totalRetail)}</div>
        </div>
      </div>

      {/* Search + Low Stock Filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Icon d={icons.search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} className={`${inp} pl-10`} placeholder="Search parts by name or part number..." />
        </div>
        <button
          onClick={() => setShowLowOnly(!showLowOnly)}
          className={`px-4 py-2 rounded-lg text-sm font-heading font-semibold tracking-wider transition whitespace-nowrap ${
            showLowOnly
              ? 'bg-error/20 text-error border border-error/30'
              : 'bg-card border border-bdr text-slate-400 hover:text-white'
          }`}
        >
          Low Stock Only
        </button>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-error/10 border border-error/30 rounded-lg p-3 flex items-center gap-2">
          <Icon d={icons.alert} size={16} stroke="#ef4444" />
          <span className="text-sm text-error font-medium">{lowStock.length} part(s) at or below minimum stock level</span>
        </div>
      )}

      {/* Table */}
      {parts.length === 0 && loaded ? (
        <EmptyState
          icon={icons.box}
          title="No Parts in Inventory"
          description="Add parts to track stock levels, costs, and margins across your shop."
          action={{ label: 'Add Part', onClick: () => { setEditPart(null); setShowNew(true); } }}
        />
      ) : (
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        {!loaded ? (
          <div className="h-[400px] animate-pulse" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-bdr">
                <TH>Part Name</TH><TH>Part #</TH><TH>Category</TH><TH>Vendor</TH><TH>In Stock</TH><TH>Cost</TH><TH>Price</TH><TH>Margin</TH><TH></TH>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><TD colSpan={9}><span className="text-slate-500">No parts found.</span></TD></tr>
              ) : filtered.map(p => {
                const margin = p.price > 0 ? ((p.price - p.cost) / p.price * 100).toFixed(0) : '0';
                const isLow = p.qty_on_hand <= p.min_stock;
                return (
                  <tr key={p.id} className="border-b border-bdr/50 hover:bg-surface/30 transition">
                    <TD><span className="font-medium text-white">{p.name}</span></TD>
                    <TD><span className="text-slate-400 text-xs font-mono">{p.part_number || '—'}</span></TD>
                    <TD>{p.category || '—'}</TD>
                    <TD><span className="text-xs text-slate-400">{p.vendor?.name || '—'}</span></TD>
                    <TD>
                      <span className={isLow ? 'text-error font-bold' : ''}>{p.qty_on_hand}</span>
                      {isLow && <span className="text-[10px] text-error ml-1">(min: {p.min_stock})</span>}
                    </TD>
                    <TD>{fmt(p.cost)}</TD>
                    <TD>{fmt(p.price)}</TD>
                    <TD><span className="text-success">{margin}%</span></TD>
                    <TD>
                      <div className="flex gap-1">
                        <button onClick={() => setEditPart(p)} className="p-1 rounded hover:bg-card text-slate-500 hover:text-white transition"><Icon d={icons.edit} size={14} /></button>
                        <button onClick={() => deletePart(p.id)} className="p-1 rounded hover:bg-error/20 text-slate-500 hover:text-error transition"><Icon d={icons.x} size={14} /></button>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Add/Edit Modal */}
      <PartModal
        open={showNew || !!editPart}
        part={editPart}
        vendors={vendors}
        onClose={() => { setShowNew(false); setEditPart(null); }}
        onSaved={() => { setShowNew(false); setEditPart(null); fetchParts(); }}
      />
    </div>
  );
}

function PartModal({ open, part, vendors, onClose, onSaved }: {
  open: boolean; part: PartInventory | null; vendors: Vendor[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [category, setCategory] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [qty, setQty] = useState('0');
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [minStock, setMinStock] = useState('0');

  useEffect(() => {
    if (part) {
      setName(part.name); setPartNumber(part.part_number || ''); setCategory(part.category || '');
      setVendorId(part.vendor_id || '');
      setQty(String(part.qty_on_hand)); setCost(String(part.cost)); setPrice(String(part.price)); setMinStock(String(part.min_stock));
    } else {
      setName(''); setPartNumber(''); setCategory(''); setVendorId(''); setQty('0'); setCost(''); setPrice(''); setMinStock('0');
    }
  }, [part, open]);

  const submit = async () => {
    if (!name.trim()) return;
    const body = { name: name.trim(), part_number: partNumber || null, category: category || null, vendor_id: vendorId || null, qty_on_hand: parseInt(qty)||0, cost: parseFloat(cost)||0, price: parseFloat(price)||0, min_stock: parseInt(minStock)||0 };
    if (part) {
      await fetch(`/api/parts-inventory/${part.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } else {
      await fetch('/api/parts-inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    onSaved();
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <Modal open={open} onClose={onClose} title={part ? 'Edit Part' : 'Add Part'}>
      <div className="space-y-4">
        <div><label className={lbl}>Part Name *</label><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. Ceramic Brake Pads - Front" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={lbl}>Part Number</label><input value={partNumber} onChange={e => setPartNumber(e.target.value)} className={inp} placeholder="e.g. BPF-2024" /></div>
          <div><label className={lbl}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className={inp}>
              <option value="">Select...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>Vendor</label>
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={inp}>
            <option value="">No vendor</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={lbl}>Qty on Hand</label><input type="number" value={qty} onChange={e => setQty(e.target.value)} className={inp} /></div>
          <div><label className={lbl}>Cost</label><input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)} className={inp} placeholder="0.00" /></div>
          <div><label className={lbl}>Price</label><input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} className={inp} placeholder="0.00" /></div>
        </div>
        <div><label className={lbl}>Min Stock Level</label><input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} className={`${inp} w-32`} /></div>
        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={!name.trim()}>{part ? 'Save Changes' : 'Add Part'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
