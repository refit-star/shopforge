'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { fmt } from '@/lib/utils';
import type { Customer, Vehicle, LaborLine, PartsLine } from '@/lib/types';

export function NewEstimateModal({ open, onClose, onCreated, defaultRate, defaultCustomer, defaultVehicles }: {
  open: boolean; onClose: () => void; onCreated: (id?: string) => void; defaultRate: number;
  defaultCustomer?: Customer | null; defaultVehicles?: Vehicle[];
}) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');

  // Pre-fill from props when modal opens
  useEffect(() => {
    if (open && defaultCustomer) {
      setSelectedCustomer(defaultCustomer);
      setCustomerSearch(defaultCustomer.name);
      const veh = defaultVehicles || [];
      setVehicles(veh);
      if (veh.length > 0) setVehicleId(veh[veh.length - 1].id);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showDropdown, setShowDropdown] = useState(false);
  const [job, setJob] = useState('');
  const [notes, setNotes] = useState('');
  const [laborLines, setLaborLines] = useState<LaborLine[]>([]);
  const [partsLines, setPartsLines] = useState<PartsLine[]>([]);
  const [showLabor, setShowLabor] = useState(false);
  const [showPart, setShowPart] = useState(false);
  const [lDesc, setLDesc] = useState(''); const [lHrs, setLHrs] = useState('1'); const [lRate, setLRate] = useState(String(defaultRate));
  const [pName, setPName] = useState(''); const [pQty, setPQty] = useState('1'); const [pPrice, setPPrice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchCustomer = (q: string) => {
    setCustomerSearch(q); setSelectedCustomer(null); setVehicles([]); setVehicleId('');
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setCustomerResults([]); setShowDropdown(false); return; }
    timer.current = setTimeout(async () => {
      const json = await fetch(`/api/customers?q=${encodeURIComponent(q)}`).then(r => r.json());
      setCustomerResults(Array.isArray(json) ? json : json.data ?? []); setShowDropdown(true);
    }, 250);
  };

  const pickCustomer = async (c: Customer) => {
    setSelectedCustomer(c); setCustomerSearch(c.name); setShowDropdown(false);
    const detail = await fetch(`/api/customers/${c.id}`).then(r => r.json());
    setVehicles(detail.vehicles || []);
    if (detail.vehicles?.length === 1) setVehicleId(detail.vehicles[0].id);
  };

  const reset = () => {
    setCustomerSearch(''); setSelectedCustomer(null); setCustomerResults([]); setVehicles([]);
    setVehicleId(''); setJob(''); setNotes(''); setLaborLines([]); setPartsLines([]);
    setShowLabor(false); setShowPart(false); setShowDropdown(false);
  };

  const submit = async () => {
    if (!selectedCustomer || !vehicleId || !job.trim()) return;
    const res = await fetch('/api/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selectedCustomer.id, vehicle_id: vehicleId, job, notes: notes || null,
        labor: laborLines, parts: partsLines,
      }),
    });
    let estId: string | undefined;
    if (res.ok) {
      const est = await res.json();
      estId = est.id;
    }
    reset(); onCreated(estId);
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const inpSm = 'w-full bg-card border border-bdr rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="New Estimate" wide>
      <div className="space-y-4">
        {/* Customer */}
        <div className="relative">
          <label className={lbl}>Customer *</label>
          <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
            onFocus={() => { if (customerResults.length > 0 && !selectedCustomer) setShowDropdown(true); }}
            className={inp} placeholder="Type to search customers..." />
          {selectedCustomer && (
            <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setVehicles([]); setVehicleId(''); }}
              className="absolute right-3 top-[34px] text-slate-500 hover:text-white"><Icon d={icons.x} size={14} /></button>
          )}
          {showDropdown && customerResults.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {customerResults.map(c => (
                <button key={c.id} onClick={() => pickCustomer(c)}
                  className="w-full px-3 py-2.5 text-left hover:bg-surface/50 transition">
                  <div className="text-sm text-white">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.phone || c.email || ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Vehicle *</label>
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} disabled={!selectedCustomer}
              className={`${inp} disabled:opacity-40`}>
              <option value="">{selectedCustomer ? 'Select vehicle...' : 'Select customer first'}</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.year || ''} {v.make} {v.model} {v.plate ? `(${v.plate})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Service Description *</label>
            <input value={job} onChange={e => setJob(e.target.value)} className={inp} placeholder="e.g. Brake inspection & repair" />
          </div>
        </div>

        <div>
          <label className={lbl}>Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={`${inp} resize-none`} placeholder="Additional details..." />
        </div>

        {/* Labor */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Labor</label>
            <button onClick={() => setShowLabor(!showLabor)} className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Labor
            </button>
          </div>
          {showLabor && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={lDesc} onChange={e => setLDesc(e.target.value)} className={`${inpSm} !bg-card`} placeholder="Labor description..." />
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] text-slate-600 uppercase">Hours</label><input type="number" step="0.1" value={lHrs} onChange={e => setLHrs(e.target.value)} className={inpSm} /></div>
                <div><label className="text-[10px] text-slate-600 uppercase">Rate/hr</label><input type="number" step="0.01" value={lRate} onChange={e => setLRate(e.target.value)} className={inpSm} /></div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => { if (!lDesc.trim()) return; setLaborLines(p => [...p, { description: lDesc, hours: parseFloat(lHrs)||1, rate: parseFloat(lRate)||defaultRate }]); setLDesc(''); setLHrs('1'); setLRate(String(defaultRate)); setShowLabor(false); }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowLabor(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {laborLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {laborLines.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0"><span className="text-xs text-slate-300 truncate block">{l.description}</span><span className="text-[10px] text-slate-500">{l.hours}h x {fmt(l.rate)} = {fmt(l.hours*l.rate)}</span></div>
                  <button onClick={() => setLaborLines(p => p.filter((_,idx) => idx!==i))} className="text-slate-600 hover:text-error ml-2"><Icon d={icons.x} size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parts */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Parts</label>
            <button onClick={() => setShowPart(!showPart)} className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Part
            </button>
          </div>
          {showPart && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={pName} onChange={e => setPName(e.target.value)} className={`${inpSm} !bg-card`} placeholder="Part name..." />
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[10px] text-slate-600 uppercase">Qty</label><input type="number" value={pQty} onChange={e => setPQty(e.target.value)} className={inpSm} /></div>
                <div><label className="text-[10px] text-slate-600 uppercase">Price</label><input type="number" step="0.01" value={pPrice} onChange={e => setPPrice(e.target.value)} className={inpSm} placeholder="0.00" /></div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => { if (!pName.trim()) return; setPartsLines(p => [...p, { name: pName, qty: parseInt(pQty)||1, price: parseFloat(pPrice)||0 }]); setPName(''); setPQty('1'); setPPrice(''); setShowPart(false); }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowPart(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {partsLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {partsLines.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0"><span className="text-xs text-slate-300 truncate block">{p.name}</span><span className="text-[10px] text-slate-500">{p.qty} x {fmt(p.price)} = {fmt(p.qty*p.price)}</span></div>
                  <button onClick={() => setPartsLines(prev => prev.filter((_,idx) => idx!==i))} className="text-slate-600 hover:text-error ml-2"><Icon d={icons.x} size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        {(laborLines.length > 0 || partsLines.length > 0) && (
          <div className="bg-bg rounded-lg p-3 border border-bdr">
            <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-500">Labor</span><span className="text-slate-300">{fmt(laborLines.reduce((s,l) => s+l.hours*l.rate, 0))}</span></div>
            <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Parts</span><span className="text-slate-300">{fmt(partsLines.reduce((s,p) => s+p.qty*p.price, 0))}</span></div>
            <div className="border-t border-bdr my-1" />
            <div className="flex justify-between text-sm font-bold"><span className="text-white">Estimated Total</span><span className="text-accent">{fmt(laborLines.reduce((s,l) => s+l.hours*l.rate, 0) + partsLines.reduce((s,p) => s+p.qty*p.price, 0))}</span></div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Btn>
          <Btn onClick={submit} disabled={!selectedCustomer || !vehicleId || !job.trim()}>Create Estimate</Btn>
        </div>
      </div>
    </Modal>
  );
}
