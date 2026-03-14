'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { fmt } from '@/lib/utils';
import type { Customer, Vehicle, Tech, Priority, CannedJob } from '@/lib/types';

interface NewWOModalProps {
  open: boolean;
  onClose: () => void;
  techs: Tech[];
  onCreated: () => void;
  defaultLaborRate?: number;
}

export function NewWOModal({ open, onClose, techs, onCreated, defaultLaborRate = 125 }: NewWOModalProps) {
  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Canned Jobs
  const [cannedJobs, setCannedJobs] = useState<CannedJob[]>([]);
  const [selectedCannedJobId, setSelectedCannedJobId] = useState('');
  const [filledFromTemplate, setFilledFromTemplate] = useState(false);

  // Basic fields
  const [vehicleId, setVehicleId] = useState('');
  const [priority, setPriority] = useState<Priority>('low');
  const [job, setJob] = useState('');
  const [techId, setTechId] = useState('');
  const [notes, setNotes] = useState('');

  // Labor & Parts
  const [laborLines, setLaborLines] = useState<{ description: string; hours: number; rate: number }[]>([]);
  const [partsLines, setPartsLines] = useState<{ name: string; qty: number; price: number }[]>([]);
  const [showAddLabor, setShowAddLabor] = useState(false);
  const [newLaborDesc, setNewLaborDesc] = useState('');
  const [newLaborHours, setNewLaborHours] = useState('1');
  const [newLaborRate, setNewLaborRate] = useState(String(defaultLaborRate));
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartName, setNewPartName] = useState('');
  const [newPartQty, setNewPartQty] = useState('1');
  const [newPartPrice, setNewPartPrice] = useState('');

  const handleCustomerSearch = (q: string) => {
    setCustomerSearch(q);
    setSelectedCustomer(null);
    setCustomerVehicles([]);
    setVehicleId('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setCustomerResults([]);
      setShowDropdown(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setCustomerResults(Array.isArray(json) ? json : json.data ?? []);
      setShowDropdown(true);
    }, 250);
  };

  const selectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setShowDropdown(false);
    const res = await fetch(`/api/customers/${c.id}`);
    const detail = await res.json();
    setCustomerVehicles(detail.vehicles || []);
    if (detail.vehicles?.length === 1) {
      setVehicleId(detail.vehicles[0].id);
    }
  };

  // Fetch canned jobs on mount
  useEffect(() => {
    if (open) {
      fetch('/api/canned-jobs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setCannedJobs(data);
        })
        .catch(() => {});
    }
  }, [open]);

  const handleCannedJobSelect = (id: string) => {
    setSelectedCannedJobId(id);
    if (!id) {
      // "Custom" selected — clear pre-filled lines
      setJob('');
      setLaborLines([]);
      setPartsLines([]);
      setFilledFromTemplate(false);
      return;
    }
    const cj = cannedJobs.find((j) => j.id === id);
    if (!cj) return;
    setJob(cj.description || cj.name);
    setLaborLines(
      (cj.labor_lines || []).map((l) => ({
        description: l.description,
        hours: l.hours,
        rate: l.rate,
      }))
    );
    setPartsLines(
      (cj.parts_lines || []).map((p) => ({
        name: p.name,
        qty: p.qty,
        price: p.price,
      }))
    );
    setFilledFromTemplate(true);
  };

  const resetForm = () => {
    setCustomerSearch('');
    setSelectedCustomer(null);
    setCustomerResults([]);
    setCustomerVehicles([]);
    setVehicleId('');
    setPriority('low');
    setJob('');
    setTechId('');
    setNotes('');
    setLaborLines([]);
    setPartsLines([]);
    setShowAddLabor(false);
    setShowAddPart(false);
    setShowDropdown(false);
    setSelectedCannedJobId('');
    setFilledFromTemplate(false);
  };

  const handleCreate = async () => {
    if (!selectedCustomer || !vehicleId || !job.trim()) return;
    await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: selectedCustomer.id,
        vehicle_id: vehicleId,
        priority,
        job,
        tech_id: techId || null,
        notes: notes || null,
        labor: laborLines,
        parts: partsLines,
      }),
    });
    resetForm();
    onClose();
    onCreated();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const inpSm = 'w-full bg-card border border-bdr rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <Modal open={open} onClose={handleClose} title="New Work Order" wide>
      <div className="space-y-4">
        {/* Customer Search */}
        <div className="relative">
          <label className={lbl}>Customer *</label>
          <input
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            onFocus={() => { if (customerResults.length > 0 && !selectedCustomer) setShowDropdown(true); }}
            className={inp}
            placeholder="Type to search customers..."
          />
          {selectedCustomer && (
            <button
              onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerVehicles([]); setVehicleId(''); }}
              className="absolute right-3 top-[34px] text-slate-500 hover:text-white"
            >
              <Icon d={icons.x} size={14} />
            </button>
          )}
          {showDropdown && customerResults.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCustomer(c)}
                  className="w-full px-3 py-2.5 text-left hover:bg-surface/50 transition flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm text-white">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.phone || c.email || ''}</div>
                  </div>
                  <span className="text-xs text-slate-500">{c.vehicle_count ?? 0} vehicles</span>
                </button>
              ))}
            </div>
          )}
          {showDropdown && customerSearch.trim() && customerResults.length === 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-card border border-bdr rounded-lg shadow-xl p-3 text-sm text-slate-500">
              No customers found.
            </div>
          )}
        </div>

        {/* Vehicle + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Vehicle *</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={!selectedCustomer}
              className={`${inp} disabled:opacity-40`}>
              <option value="">{selectedCustomer ? 'Select vehicle...' : 'Select customer first'}</option>
              {customerVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.year || ''} {v.make} {v.model} {v.plate ? `(${v.plate})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
              className={inp}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Canned Job Selector */}
        {cannedJobs.length > 0 && (
          <div>
            <label className={lbl}>Canned Job Template</label>
            <select
              value={selectedCannedJobId}
              onChange={(e) => handleCannedJobSelect(e.target.value)}
              className={inp}
            >
              <option value="">Custom (start fresh)</option>
              {cannedJobs.map((cj) => {
                const laborTotal = (cj.labor_lines || []).reduce((s, l) => s + l.hours * l.rate, 0);
                const partsTotal = (cj.parts_lines || []).reduce((s, p) => s + p.qty * p.price, 0);
                return (
                  <option key={cj.id} value={cj.id}>
                    {cj.name} — est. {fmt(laborTotal + partsTotal)}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Job Description */}
        <div>
          <label className={lbl}>Reason for Service *</label>
          <input value={job} onChange={(e) => { setJob(e.target.value); }} className={inp}
            placeholder="e.g. Brake pad replacement" />
        </div>

        {/* Tech */}
        <div>
          <label className={lbl}>Assigned Tech</label>
          <select value={techId} onChange={(e) => setTechId(e.target.value)}
            className={inp}>
            <option value="">Select tech...</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className={lbl}>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className={`${inp} resize-none`}
            placeholder="Customer complaint, initial observations..." />
        </div>

        {/* Template indicator */}
        {filledFromTemplate && (
          <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">
            <Icon d={icons.clipboard} size={14} stroke="#f97316" />
            <span className="text-xs text-accent font-body">
              Lines pre-filled from template — edit freely
            </span>
            <button
              onClick={() => setFilledFromTemplate(false)}
              className="ml-auto text-slate-500 hover:text-white"
            >
              <Icon d={icons.x} size={12} />
            </button>
          </div>
        )}

        {/* Labor Operations */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">
              Labor Operations
            </label>
            <button type="button" onClick={() => setShowAddLabor(!showAddLabor)}
              className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Labor
            </button>
          </div>
          {showAddLabor && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={newLaborDesc} onChange={(e) => setNewLaborDesc(e.target.value)}
                className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                placeholder="e.g. Brake pad replacement - front" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-600 uppercase">Hours</label>
                  <input type="number" step="0.1" value={newLaborHours} onChange={(e) => setNewLaborHours(e.target.value)} className={inpSm} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 uppercase">Rate/hr</label>
                  <input type="number" step="0.01" value={newLaborRate} onChange={(e) => setNewLaborRate(e.target.value)} className={inpSm} />
                </div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => {
                    if (!newLaborDesc.trim()) return;
                    setLaborLines(prev => [...prev, { description: newLaborDesc, hours: parseFloat(newLaborHours) || 1, rate: parseFloat(newLaborRate) || defaultLaborRate }]);
                    setNewLaborDesc(''); setNewLaborHours('1'); setNewLaborRate(String(defaultLaborRate)); setShowAddLabor(false);
                  }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowAddLabor(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {laborLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {laborLines.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-slate-300 truncate block">{l.description}</span>
                    <span className="text-[10px] text-slate-500">{l.hours}h × {fmt(l.rate)} = {fmt(l.hours * l.rate)}</span>
                  </div>
                  <button onClick={() => setLaborLines(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-600 hover:text-error ml-2 shrink-0">
                    <Icon d={icons.x} size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Parts */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">Parts</label>
            <button type="button" onClick={() => setShowAddPart(!showAddPart)}
              className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
              <Icon d={icons.plus} size={10} />Add Part
            </button>
          </div>
          {showAddPart && (
            <div className="bg-bg border border-accent/30 rounded-lg p-2.5 mb-2 space-y-2">
              <input value={newPartName} onChange={(e) => setNewPartName(e.target.value)}
                className="w-full bg-card border border-bdr rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body"
                placeholder="e.g. Brake Pads - Ceramic Front" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-slate-600 uppercase">Qty</label>
                  <input type="number" value={newPartQty} onChange={(e) => setNewPartQty(e.target.value)} className={inpSm} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-600 uppercase">Price</label>
                  <input type="number" step="0.01" value={newPartPrice} onChange={(e) => setNewPartPrice(e.target.value)} className={inpSm} placeholder="0.00" />
                </div>
                <div className="flex items-end gap-1">
                  <Btn small onClick={() => {
                    if (!newPartName.trim()) return;
                    setPartsLines(prev => [...prev, { name: newPartName, qty: parseInt(newPartQty) || 1, price: parseFloat(newPartPrice) || 0 }]);
                    setNewPartName(''); setNewPartQty('1'); setNewPartPrice(''); setShowAddPart(false);
                  }}>Add</Btn>
                  <Btn small variant="secondary" onClick={() => setShowAddPart(false)}>X</Btn>
                </div>
              </div>
            </div>
          )}
          {partsLines.length > 0 && (
            <div className="bg-bg border border-bdr rounded-lg overflow-hidden">
              {partsLines.map((p, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-bdr/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-slate-300 truncate block">{p.name}</span>
                    <span className="text-[10px] text-slate-500">{p.qty} × {fmt(p.price)} = {fmt(p.qty * p.price)}</span>
                  </div>
                  <button onClick={() => setPartsLines(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-600 hover:text-error ml-2 shrink-0">
                    <Icon d={icons.x} size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals preview */}
        {(laborLines.length > 0 || partsLines.length > 0) && (
          <div className="bg-bg rounded-lg p-3 border border-bdr">
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-slate-500">Labor</span>
              <span className="text-slate-300">{fmt(laborLines.reduce((s, l) => s + l.hours * l.rate, 0))}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Parts</span>
              <span className="text-slate-300">{fmt(partsLines.reduce((s, p) => s + p.qty * p.price, 0))}</span>
            </div>
            <div className="border-t border-bdr my-1" />
            <div className="flex justify-between text-sm font-bold">
              <span className="text-white">Estimated Total</span>
              <span className="text-accent">
                {fmt(laborLines.reduce((s, l) => s + l.hours * l.rate, 0) + partsLines.reduce((s, p) => s + p.qty * p.price, 0))}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Btn variant="secondary" onClick={handleClose}>Cancel</Btn>
          <Btn onClick={handleCreate} disabled={!selectedCustomer || !vehicleId || !job.trim()}>
            Create Work Order
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
