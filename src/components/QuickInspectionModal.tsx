'use client';

import { useState, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import type { Customer, Vehicle } from '@/lib/types';

interface QuickInspectionModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (woId: string) => void;
}

export function QuickInspectionModal({ open, onClose, onCreated }: QuickInspectionModalProps) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const resetForm = () => {
    setCustomerSearch('');
    setSelectedCustomer(null);
    setCustomerResults([]);
    setCustomerVehicles([]);
    setVehicleId('');
    setShowDropdown(false);
    setCreating(false);
  };

  const handleCreate = async () => {
    if (!selectedCustomer || !vehicleId) return;
    setCreating(true);

    try {
      // Create WO with "Vehicle Inspection" job
      const woRes = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          vehicle_id: vehicleId,
          job: 'Vehicle Inspection',
          priority: 'low',
        }),
      });

      if (!woRes.ok) { setCreating(false); return; }
      const wo = await woRes.json();

      // Start the inspection immediately
      await fetch(`/api/work-orders/${wo.id}/inspection`, { method: 'POST' });

      resetForm();
      onClose();
      onCreated(wo.id);
    } catch {
      setCreating(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Quick Inspection">
      <p className="text-xs text-slate-500 mb-4">
        Pick a customer and vehicle to start an inspection right away.
      </p>

      {/* Customer search */}
      <div className="mb-4 relative">
        <label className="block text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider mb-1">Customer</label>
        <input
          type="text"
          value={customerSearch}
          onChange={e => handleCustomerSearch(e.target.value)}
          className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50"
          placeholder="Search by name or phone..."
          autoFocus
        />
        {showDropdown && customerResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {customerResults.map(c => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-bg/50 transition"
              >
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-slate-600 ml-2 text-xs">{c.phone}</span>}
              </button>
            ))}
          </div>
        )}
        {showDropdown && customerResults.length === 0 && customerSearch.trim() && (
          <div className="absolute z-10 mt-1 w-full bg-card border border-bdr rounded-lg shadow-xl px-3 py-2 text-xs text-slate-500">
            No customers found
          </div>
        )}
      </div>

      {/* Vehicle picker */}
      {selectedCustomer && (
        <div className="mb-5">
          <label className="block text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider mb-1">Vehicle</label>
          {customerVehicles.length === 0 ? (
            <p className="text-xs text-slate-500">No vehicles on file for this customer.</p>
          ) : (
            <div className="space-y-1.5">
              {customerVehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setVehicleId(v.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition ${
                    vehicleId === v.id
                      ? 'border-accent/50 bg-accent/10 text-white'
                      : 'border-bdr bg-bg/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <span className="font-medium">{[v.year, v.make, v.model].filter(Boolean).join(' ')}</span>
                  {v.plate && <span className="text-slate-600 ml-2 text-xs">{v.plate}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <Btn
        onClick={handleCreate}
        disabled={!selectedCustomer || !vehicleId || creating}
        className="w-full"
      >
        {creating ? 'Creating...' : 'Start Inspection'}
      </Btn>
    </Modal>
  );
}
