'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { SlideOver } from '@/components/ui/SlideOver';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { TH, TD } from '@/components/ui/Table';
import { fmt } from '@/lib/utils';
import type { Customer, Vehicle } from '@/lib/types';

interface CustomerDetail extends Customer {
  vehicles: Vehicle[];
  service_history: {
    id: string;
    display_id: string;
    job: string;
    status: string;
    created_at: string;
    vehicle?: { year: number | null; make: string; model: string };
    estimated_total?: number;
  }[];
  outstanding_balance: number;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add Customer modal
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);

  // Add Vehicle form (inside detail)
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vYear, setVYear] = useState('');
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vVin, setVVin] = useState('');
  const [vMileage, setVMileage] = useState('');
  const [vPlate, setVPlate] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);

  // Edit customer
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback((q: string) => {
    const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
    fetch(url)
      .then(r => r.json())
      .then(data => { setCustomers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCustomers('');
  }, [fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchCustomers]);

  const openCustomer = async (c: Customer) => {
    setDetailLoading(true);
    setSelectedCustomer(null);
    setEditing(false);
    setShowAddVehicle(false);
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      const detail: CustomerDetail = await res.json();
      setSelectedCustomer(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (id: string) => {
    const res = await fetch(`/api/customers/${id}`);
    const detail: CustomerDetail = await res.json();
    setSelectedCustomer(detail);
  };

  const handleAddCustomer = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || null, email: newEmail.trim() || null }),
      });
      if (res.ok) {
        setShowAddCustomer(false);
        setNewName(''); setNewPhone(''); setNewEmail('');
        fetchCustomers(search);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleAddVehicle = async () => {
    if (!selectedCustomer || !vMake.trim() || !vModel.trim()) return;
    setAddingVehicle(true);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          year: vYear ? parseInt(vYear) : null,
          make: vMake.trim(),
          model: vModel.trim(),
          vin: vVin.trim() || null,
          mileage: vMileage ? parseInt(vMileage) : null,
          plate: vPlate.trim() || null,
        }),
      });
      if (res.ok) {
        setShowAddVehicle(false);
        setVYear(''); setVMake(''); setVModel(''); setVVin(''); setVMileage(''); setVPlate('');
        await refreshDetail(selectedCustomer.id);
        fetchCustomers(search);
      }
    } finally {
      setAddingVehicle(false);
    }
  };

  const handleSaveCustomer = async () => {
    if (!selectedCustomer || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null, email: editEmail.trim() || null }),
      });
      if (res.ok) {
        setEditing(false);
        await refreshDetail(selectedCustomer.id);
        fetchCustomers(search);
      }
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => {
    if (!selectedCustomer) return;
    setEditName(selectedCustomer.name);
    setEditPhone(selectedCustomer.phone || '');
    setEditEmail(selectedCustomer.email || '');
    setEditing(true);
  };

  const inputCls = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const labelCls = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-10 flex-1 max-w-md bg-card border border-bdr rounded-lg animate-pulse" />
        </div>
        <div className="bg-card border border-bdr rounded-xl h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search + Add */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Icon d={icons.search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-bdr rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50 font-body"
            placeholder="Search by name, phone, or email..."
          />
        </div>
        <span className="text-sm text-slate-500">{customers.length} customers</span>
        <Btn onClick={() => setShowAddCustomer(true)}>
          <span className="flex items-center gap-2">
            <Icon d={icons.plus} size={16} />
            Add Customer
          </span>
        </Btn>
      </div>

      {/* Customer table */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface/50">
            <tr>
              <TH>Customer</TH>
              <TH>Phone</TH>
              <TH>Vehicles</TH>
              <TH>Last Visit</TH>
              <TH className="text-right">Total Spend</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-bdr">
            {customers.map(c => (
              <tr
                key={c.id}
                className="hover:bg-surface/30 transition cursor-pointer"
                onClick={() => openCustomer(c)}
              >
                <TD>
                  <div>
                    <span className="text-white font-medium">{c.name}</span>
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </div>
                </TD>
                <TD className="text-slate-300">{c.phone}</TD>
                <TD>
                  <span className="text-slate-400">
                    {c.vehicle_count ?? 0} vehicle{(c.vehicle_count ?? 0) !== 1 ? 's' : ''}
                  </span>
                </TD>
                <TD className="text-slate-400">
                  {c.last_visit ? new Date(c.last_visit).toLocaleDateString() : '--'}
                </TD>
                <TD className="text-right">
                  <span className="text-slate-200 font-medium">{fmt(c.total_spend ?? 0)}</span>
                </TD>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <TD colSpan={5} className="text-center text-slate-500 py-12">
                  No customers found.
                </TD>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Customer Modal */}
      <Modal open={showAddCustomer} onClose={() => setShowAddCustomer(false)} title="Add Customer">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} className={inputCls} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone</label>
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)} className={inputCls} placeholder="(555) 555-0000" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputCls} placeholder="email@example.com" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => setShowAddCustomer(false)}>Cancel</Btn>
            <Btn onClick={handleAddCustomer} disabled={creating || !newName.trim()}>
              {creating ? 'Adding...' : 'Add Customer'}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Customer Detail Slide-Over */}
      <SlideOver
        open={!!selectedCustomer || detailLoading}
        onClose={() => { setSelectedCustomer(null); setDetailLoading(false); setEditing(false); setShowAddVehicle(false); }}
        title={selectedCustomer ? selectedCustomer.name : 'Loading...'}
      >
        {detailLoading && (
          <div className="space-y-4">
            <div className="bg-bg rounded-lg p-4 border border-bdr h-40 animate-pulse" />
            <div className="bg-bg rounded-lg p-4 border border-bdr h-32 animate-pulse" />
          </div>
        )}
        {selectedCustomer && (() => {
          const c = selectedCustomer;
          return (
            <div className="space-y-6">
              {/* Contact Info */}
              <div className="bg-bg rounded-lg p-4 border border-bdr">
                {editing ? (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Name</label>
                      <input value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Phone</label>
                        <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <input value={editEmail} onChange={e => setEditEmail(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Btn small onClick={handleSaveCustomer} disabled={saving}>
                        {saving ? 'Saving...' : 'Save'}
                      </Btn>
                      <Btn small variant="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500 font-heading uppercase tracking-wider">Phone</span>
                      <span className="text-sm text-slate-200">{c.phone || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500 font-heading uppercase tracking-wider">Email</span>
                      <span className="text-sm text-slate-200">{c.email || '--'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500 font-heading uppercase tracking-wider">Total Spend</span>
                      <span className="text-sm text-accent font-semibold">{fmt(c.total_spend ?? 0)}</span>
                    </div>
                    {c.outstanding_balance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-xs text-slate-500 font-heading uppercase tracking-wider">Outstanding</span>
                        <span className="text-sm text-error font-semibold">{fmt(c.outstanding_balance)}</span>
                      </div>
                    )}
                    <div className="pt-1">
                      <Btn small variant="ghost" onClick={startEditing}>
                        <span className="flex items-center gap-1.5">
                          <Icon d={icons.wrench} size={13} />
                          Edit Info
                        </span>
                      </Btn>
                    </div>
                  </div>
                )}
              </div>

              {/* Vehicles */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">
                    Vehicles ({c.vehicles.length})
                  </h4>
                  <Btn small variant="secondary" onClick={() => setShowAddVehicle(!showAddVehicle)}>
                    <span className="flex items-center gap-1.5">
                      <Icon d={icons.plus} size={14} />
                      Add Vehicle
                    </span>
                  </Btn>
                </div>

                {showAddVehicle && (
                  <div className="bg-surface border border-bdr rounded-lg p-4 mb-3 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Year</label>
                        <input value={vYear} onChange={e => setVYear(e.target.value)} className={inputCls} placeholder="2024" type="number" />
                      </div>
                      <div>
                        <label className={labelCls}>Make *</label>
                        <input value={vMake} onChange={e => setVMake(e.target.value)} className={inputCls} placeholder="Ford" />
                      </div>
                      <div>
                        <label className={labelCls}>Model *</label>
                        <input value={vModel} onChange={e => setVModel(e.target.value)} className={inputCls} placeholder="F-150" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>VIN</label>
                        <input value={vVin} onChange={e => setVVin(e.target.value)} className={inputCls} placeholder="Optional" />
                      </div>
                      <div>
                        <label className={labelCls}>Mileage</label>
                        <input value={vMileage} onChange={e => setVMileage(e.target.value)} className={inputCls} placeholder="0" type="number" />
                      </div>
                      <div>
                        <label className={labelCls}>Plate</label>
                        <input value={vPlate} onChange={e => setVPlate(e.target.value)} className={inputCls} placeholder="ABC1234" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Btn small onClick={handleAddVehicle} disabled={addingVehicle || !vMake.trim() || !vModel.trim()}>
                        {addingVehicle ? 'Adding...' : 'Save Vehicle'}
                      </Btn>
                      <Btn small variant="ghost" onClick={() => setShowAddVehicle(false)}>Cancel</Btn>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {c.vehicles.map(v => (
                    <div key={v.id} className="bg-bg rounded-lg p-3 border border-bdr">
                      <div className="text-sm text-white font-medium">
                        {v.year} {v.make} {v.model}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase">VIN</span>
                          <div className="text-xs text-slate-400 font-mono">
                            {v.vin ? `${v.vin.slice(0, 9)}...` : '--'}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase">Mileage</span>
                          <div className="text-xs text-slate-400">
                            {v.mileage ? `${v.mileage.toLocaleString()} mi` : '--'}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase">Plate</span>
                          <div className="text-xs text-slate-400">{v.plate || '--'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {c.vehicles.length === 0 && (
                    <div className="text-sm text-slate-500">No vehicles on file.</div>
                  )}
                </div>
              </div>

              {/* Service History */}
              <div>
                <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-3">
                  Service History
                </h4>
                {c.service_history.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-bdr" />
                    <div className="space-y-0">
                      {c.service_history.map((r, i) => {
                        const vStr = r.vehicle
                          ? `${r.vehicle.year || ''} ${r.vehicle.make} ${r.vehicle.model}`.trim()
                          : '';
                        const date = r.created_at
                          ? new Date(r.created_at).toLocaleDateString()
                          : '';
                        return (
                          <div key={r.id || i} className="relative pl-8 py-3 border-b border-bdr/50 last:border-0">
                            <div
                              className="absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 bg-bg"
                              style={{ borderColor: i === 0 ? '#f97316' : '#252a35' }}
                            />
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm text-slate-200 font-medium">{r.job}</div>
                                <div className="text-xs text-slate-500">
                                  {vStr} · {r.display_id}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-slate-500">{date}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No service history yet.</div>
                )}
              </div>
            </div>
          );
        })()}
      </SlideOver>
    </div>
  );
}
