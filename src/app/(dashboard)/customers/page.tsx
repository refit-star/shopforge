'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { SlideOver } from '@/components/ui/SlideOver';
import { Modal } from '@/components/ui/Modal';
import { Btn } from '@/components/ui/Btn';
import { VinInput } from '@/components/ui/VinInput';
import { PlateInput } from '@/components/ui/PlateInput';
import { TH, TD } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NewWOModal } from '@/components/NewWOModal';
import { NewEstimateModal } from '@/components/NewEstimateModal';
import { fmt } from '@/lib/utils';
import type { Customer, Vehicle, ServiceReminder, CustomerTag, Tech, ShopSettings } from '@/lib/types';
import { CUSTOMER_TAGS, TAG_COLORS } from '@/lib/types';

interface ServiceHistoryEntry {
  id: string;
  display_id: string;
  job: string;
  status: string;
  created_at: string;
  vehicle?: { id: string; year: number | null; make: string; model: string } | null;
  vehicle_id?: string | null;
  mileage_in?: number | null;
  mileage_out?: number | null;
  estimated_total?: number;
}

interface InvoiceEntry {
  id: string;
  display_id: string;
  status: string;
  total: number;
  labor_total: number;
  parts_total: number;
  tax: number;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string;
  vehicle?: { year: number | null; make: string; model: string } | null;
}

interface CustomerDetail extends Customer {
  vehicles: Vehicle[];
  service_history: ServiceHistoryEntry[];
  invoices: InvoiceEntry[];
  outstanding_balance: number;
}

interface TimelineItem {
  id: string;
  rawId: string;
  type: 'wo' | 'invoice';
  display_id: string;
  description: string;
  status: string;
  date: string;
  vehicleStr: string;
  total: number;
}

export default function CustomersPage() {
  return <Suspense fallback={null}><CustomersContent /></Suspense>;
}

function CustomersContent() {
  const searchParams = useSearchParams();
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
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newZip, setNewZip] = useState('');
  const [creating, setCreating] = useState(false);
  // Inline vehicle on new customer
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [nvYear, setNvYear] = useState('');
  const [nvMake, setNvMake] = useState('');
  const [nvModel, setNvModel] = useState('');
  const [nvVin, setNvVin] = useState('');
  const [nvMileage, setNvMileage] = useState('');
  const [nvPlate, setNvPlate] = useState('');
  const [nvPlateState, setNvPlateState] = useState('');

  // Add Vehicle form (inside detail)
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [vYear, setVYear] = useState('');
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vVin, setVVin] = useState('');
  const [vMileage, setVMileage] = useState('');
  const [vPlate, setVPlate] = useState('');
  const [vPlateState, setVPlateState] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);

  // Service reminders
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [rServiceType, setRServiceType] = useState('');
  const [rDueDate, setRDueDate] = useState('');
  const [rDueMileage, setRDueMileage] = useState('');
  const [rVehicleId, setRVehicleId] = useState('');

  // Quick actions
  const router = useRouter();
  const [techs, setTechs] = useState<Tech[]>([]);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
  const [showQuickWO, setShowQuickWO] = useState(false);
  const [showQuickEstimate, setShowQuickEstimate] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  // Tag filter
  const [tagFilter, setTagFilter] = useState<string>('');

  // Edit customer
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editZip, setEditZip] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback((q: string) => {
    const url = q ? `/api/customers?q=${encodeURIComponent(q)}` : '/api/customers';
    fetch(url)
      .then(r => r.json())
      .then(json => { setCustomers(Array.isArray(json) ? json : json.data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCustomers('');
    fetch('/api/techs').then(r => r.json()).then(setTechs).catch(() => {});
    fetch('/api/settings').then(r => r.json()).then(setShopSettings).catch(() => {});
    const openParam = searchParams.get('open');
    if (openParam) {
      openCustomer({ id: openParam } as Customer);
    }
  }, [fetchCustomers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchCustomers]);

  const openCustomer = async (c: Customer) => {
    setDetailLoading(true);
    setSelectedCustomer(null);
    setEditing(false);
    setShowAddVehicle(false);
    setShowAddReminder(false);
    try {
      const [detail, remData] = await Promise.all([
        fetch(`/api/customers/${c.id}`).then(r => r.json()),
        fetch(`/api/service-reminders?customer_id=${c.id}`).then(r => r.json()),
      ]);
      setSelectedCustomer(detail);
      setReminders(Array.isArray(remData) ? remData : []);
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
        body: JSON.stringify({ name: newName.trim(), phone: newPhone.trim() || null, email: newEmail.trim() || null, address: newAddress.trim() || null, city: newCity.trim() || null, state: newState.trim() || null, zip: newZip.trim() || null }),
      });
      if (res.ok) {
        const customer = await res.json();
        // Create vehicle if fields are filled
        if (nvMake.trim() && nvModel.trim()) {
          await fetch('/api/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: customer.id,
              year: nvYear ? parseInt(nvYear) : null,
              make: nvMake.trim(),
              model: nvModel.trim(),
              vin: nvVin.trim() || null,
              mileage: nvMileage ? parseInt(nvMileage) : null,
              plate: nvPlate.trim() || null,
            }),
          });
        }
        setShowAddCustomer(false);
        setNewName(''); setNewPhone(''); setNewEmail('');
        setNewAddress(''); setNewCity(''); setNewState(''); setNewZip('');
        setShowNewVehicle(false); setNvYear(''); setNvMake(''); setNvModel(''); setNvVin(''); setNvMileage(''); setNvPlate(''); setNvPlateState('');
        fetchCustomers(search);
        openCustomer(customer);
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
        setVYear(''); setVMake(''); setVModel(''); setVVin(''); setVMileage(''); setVPlate(''); setVPlateState('');
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
        body: JSON.stringify({ name: editName.trim(), phone: editPhone.trim() || null, email: editEmail.trim() || null, address: editAddress.trim() || null, city: editCity.trim() || null, state: editState.trim() || null, zip: editZip.trim() || null }),
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
    setEditAddress(selectedCustomer.address || '');
    setEditCity(selectedCustomer.city || '');
    setEditState(selectedCustomer.state || '');
    setEditZip(selectedCustomer.zip || '');
    setEditing(true);
  };

  const handleQuickInspection = async () => {
    if (!selectedCustomer || selectedCustomer.vehicles.length === 0) return;
    setInspecting(true);
    try {
      const vehicle = selectedCustomer.vehicles[selectedCustomer.vehicles.length - 1];
      const woRes = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer.id,
          vehicle_id: vehicle.id,
          job: 'Vehicle Inspection',
          priority: 'low',
        }),
      });
      if (woRes.ok) {
        const wo = await woRes.json();
        // Start the inspection
        await fetch(`/api/work-orders/${wo.id}/inspection`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        setSelectedCustomer(null);
        router.push(`/work-orders?open=${wo.id}`);
      }
    } finally {
      setInspecting(false);
    }
  };

  const handleToggleTag = async (tag: string) => {
    if (!selectedCustomer) return;
    const current = selectedCustomer.tags || [];
    const newTags = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag];
    // Optimistic update
    setSelectedCustomer({ ...selectedCustomer, tags: newTags });
    await fetch(`/api/customers/${selectedCustomer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    });
    fetchCustomers(search);
  };

  // Filtered customers by tag
  const filteredCustomers = tagFilter
    ? customers.filter(c => (c.tags || []).includes(tagFilter))
    : customers;

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
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="bg-card border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body"
        >
          <option value="">All Tags</option>
          {CUSTOMER_TAGS.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        <span className="text-sm text-slate-500">{filteredCustomers.length} customers</span>
        <Btn onClick={() => setShowAddCustomer(true)}>
          <span className="flex items-center gap-2">
            <Icon d={icons.plus} size={16} />
            Add Customer
          </span>
        </Btn>
      </div>

      {/* Customer table */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
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
            {filteredCustomers.map(c => (
              <tr
                key={c.id}
                className="hover:bg-surface/30 transition cursor-pointer"
                onClick={() => openCustomer(c)}
              >
                <TD>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{c.name}</span>
                      {(c.tags || []).map(tag => {
                        const colors = TAG_COLORS[tag as CustomerTag];
                        return colors ? (
                          <span key={tag} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}>
                            {tag}
                          </span>
                        ) : null;
                      })}
                    </div>
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
            {filteredCustomers.length === 0 && (
              <tr>
                <TD colSpan={5} className="text-center text-slate-500 py-12">
                  No customers found.
                </TD>
              </tr>
            )}
          </tbody>
        </table>
        </div>
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
          <div>
            <label className={labelCls}>Address</label>
            <input value={newAddress} onChange={e => setNewAddress(e.target.value)} className={inputCls} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input value={newCity} onChange={e => setNewCity(e.target.value)} className={inputCls} placeholder="City" />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input value={newState} onChange={e => setNewState(e.target.value)} className={inputCls} placeholder="CA" />
            </div>
            <div>
              <label className={labelCls}>Zip</label>
              <input value={newZip} onChange={e => setNewZip(e.target.value)} className={inputCls} placeholder="90210" />
            </div>
          </div>
          {/* Optional Vehicle */}
          <div className="border border-bdr rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowNewVehicle(!showNewVehicle)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface/30 transition"
            >
              <span className="text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Icon d={showNewVehicle ? icons.x : icons.plus} size={12} />{showNewVehicle ? 'Hide Vehicle' : 'Add Vehicle'}
              </span>
            </button>
            {showNewVehicle && (
              <div className="px-4 pb-4 space-y-3 border-t border-bdr">
                <div className="pt-3">
                  <label className={labelCls}>Plate Lookup</label>
                  <PlateInput
                    plate={nvPlate}
                    state={nvPlateState}
                    onPlateChange={setNvPlate}
                    onStateChange={setNvPlateState}
                    onDecoded={(result) => {
                      if (result.year) setNvYear(String(result.year));
                      if (result.make) setNvMake(result.make);
                      if (result.model) setNvModel(result.model);
                      if (result.vin) setNvVin(result.vin);
                    }}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Year</label>
                    <input value={nvYear} onChange={e => setNvYear(e.target.value)} className={inputCls} placeholder="2024" type="number" />
                  </div>
                  <div>
                    <label className={labelCls}>Make</label>
                    <input value={nvMake} onChange={e => setNvMake(e.target.value)} className={inputCls} placeholder="Ford" />
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <input value={nvModel} onChange={e => setNvModel(e.target.value)} className={inputCls} placeholder="F-150" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>VIN</label>
                  <VinInput
                    value={nvVin}
                    onChange={setNvVin}
                    onDecoded={(result) => {
                      if (result.year) setNvYear(String(result.year));
                      if (result.make) setNvMake(result.make);
                      if (result.model) setNvModel(result.model);
                    }}
                    className={inputCls}
                    placeholder="Paste VIN to auto-decode"
                  />
                </div>
                <div>
                  <label className={labelCls}>Mileage</label>
                  <input value={nvMileage} onChange={e => setNvMileage(e.target.value)} className={inputCls} placeholder="0" type="number" />
                </div>
              </div>
            )}
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
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Btn small variant="secondary" onClick={() => setShowQuickWO(true)}>
                  <span className="flex items-center gap-1.5"><Icon d={icons.wrench} size={13} />New WO</span>
                </Btn>
                <Btn small variant="secondary" onClick={() => setShowQuickEstimate(true)}>
                  <span className="flex items-center gap-1.5"><Icon d={icons.clipboard} size={13} />Estimate</span>
                </Btn>
                {c.vehicles.length > 0 && (
                  <Btn small variant="secondary" onClick={handleQuickInspection} disabled={inspecting}>
                    <span className="flex items-center gap-1.5"><Icon d={icons.camera} size={13} />{inspecting ? 'Starting...' : 'Inspect'}</span>
                  </Btn>
                )}
                <Btn small variant="secondary" onClick={() => router.push(`/scheduling?newAppt=${c.id}`)}>
                  <span className="flex items-center gap-1.5"><Icon d={icons.calendar} size={13} />Schedule</span>
                </Btn>
                {c.phone && (
                  <Btn small variant="secondary" onClick={() => router.push(`/messages?phone=${encodeURIComponent(c.phone!)}`)}>
                    <span className="flex items-center gap-1.5"><Icon d={icons.message} size={13} />Message</span>
                  </Btn>
                )}
              </div>

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
                    <div>
                      <label className={labelCls}>Address</label>
                      <input value={editAddress} onChange={e => setEditAddress(e.target.value)} className={inputCls} placeholder="123 Main St" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>City</label>
                        <input value={editCity} onChange={e => setEditCity(e.target.value)} className={inputCls} placeholder="City" />
                      </div>
                      <div>
                        <label className={labelCls}>State</label>
                        <input value={editState} onChange={e => setEditState(e.target.value)} className={inputCls} placeholder="CA" />
                      </div>
                      <div>
                        <label className={labelCls}>Zip</label>
                        <input value={editZip} onChange={e => setEditZip(e.target.value)} className={inputCls} placeholder="90210" />
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
                      <span className="text-xs text-slate-500 font-heading uppercase tracking-wider">Address</span>
                      <span className="text-sm text-slate-200 text-right">
                        {c.address || c.city || c.state || c.zip
                          ? [c.address, [c.city, c.state, c.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')
                          : '--'}
                      </span>
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

              {/* Customer Tags */}
              <div className="bg-bg rounded-lg p-4 border border-bdr">
                <div className="text-xs text-slate-500 font-heading uppercase tracking-wider mb-2.5">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_TAGS.map(tag => {
                    const colors = TAG_COLORS[tag];
                    const isActive = (c.tags || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => handleToggleTag(tag)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                          isActive
                            ? `${colors.bg} ${colors.text} ${colors.border}`
                            : 'bg-transparent text-slate-600 border-bdr hover:border-slate-500 hover:text-slate-400'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

            {/* Customer Analytics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Total Spent</div>
                <div className="text-lg font-heading font-bold text-accent">
                  {fmt(c.service_history.reduce((s, h) => s + (h.estimated_total || 0), 0))}
                </div>
              </div>
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Visits</div>
                <div className="text-lg font-heading font-bold text-white">{c.service_history.length}</div>
              </div>
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Avg Ticket</div>
                <div className="text-lg font-heading font-bold text-white">
                  {c.service_history.length > 0 ? fmt(c.service_history.reduce((s, h) => s + (h.estimated_total || 0), 0) / c.service_history.length) : '$0.00'}
                </div>
              </div>
              <div className="bg-bg border border-bdr rounded-lg p-3">
                <div className="text-[10px] font-heading text-slate-600 uppercase tracking-wider mb-0.5">Balance Due</div>
                <div className={`text-lg font-heading font-bold ${c.outstanding_balance > 0 ? 'text-error' : 'text-success'}`}>
                  {fmt(c.outstanding_balance)}
                </div>
              </div>
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
                    <div>
                      <label className={labelCls}>Plate Lookup</label>
                      <PlateInput
                        plate={vPlate}
                        state={vPlateState}
                        onPlateChange={setVPlate}
                        onStateChange={setVPlateState}
                        onDecoded={(result) => {
                          if (result.year) setVYear(String(result.year));
                          if (result.make) setVMake(result.make);
                          if (result.model) setVModel(result.model);
                          if (result.vin) setVVin(result.vin);
                        }}
                        className={inputCls}
                      />
                    </div>
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
                    <div>
                      <label className={labelCls}>VIN</label>
                      <VinInput
                        value={vVin}
                        onChange={setVVin}
                        onDecoded={(result) => {
                          if (result.year) setVYear(String(result.year));
                          if (result.make) setVMake(result.make);
                          if (result.model) setVModel(result.model);
                        }}
                        className={inputCls}
                        placeholder="Paste VIN to auto-decode"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Mileage</label>
                      <input value={vMileage} onChange={e => setVMileage(e.target.value)} className={inputCls} placeholder="0" type="number" />
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
                      {/* Mileage History */}
                      {(() => {
                        const vehicleWOs = c.service_history
                          .filter(w => (w.vehicle_id === v.id || w.vehicle?.id === v.id) && (w.mileage_in || w.mileage_out))
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                        if (vehicleWOs.length === 0) return null;

                        return (
                          <div className="mt-3 pt-3 border-t border-bdr">
                            <span className="text-[10px] font-heading font-bold text-slate-600 uppercase tracking-wider">Mileage History</span>
                            <div className="mt-2 space-y-1">
                              {vehicleWOs.slice(0, 5).map(w => (
                                <div key={w.id} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500">
                                    {new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                                    <span className="text-accent ml-1">{w.display_id}</span>
                                  </span>
                                  <span className="text-slate-300">
                                    {w.mileage_in ? w.mileage_in.toLocaleString() : '\u2014'}
                                    {w.mileage_out ? ` \u2192 ${w.mileage_out.toLocaleString()}` : ''}
                                    <span className="text-slate-600 ml-1">mi</span>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  {c.vehicles.length === 0 && (
                    <div className="text-sm text-slate-500">No vehicles on file.</div>
                  )}
                </div>
              </div>

              {/* Service History Timeline */}
              <div>
                <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider mb-3">
                  Service History
                </h4>
                {(() => {
                  const vStr = (v?: { year: number | null; make: string; model: string } | null) =>
                    v ? `${v.year || ''} ${v.make} ${v.model}`.trim() : '';

                  const timeline: TimelineItem[] = [
                    ...c.service_history.map((wo): TimelineItem => ({
                      id: `wo-${wo.id}`,
                      rawId: wo.id,
                      type: 'wo',
                      display_id: wo.display_id,
                      description: wo.job,
                      status: wo.status,
                      date: wo.created_at,
                      vehicleStr: vStr(wo.vehicle),
                      total: wo.estimated_total || 0,
                    })),
                    ...c.invoices.map((inv): TimelineItem => ({
                      id: `inv-${inv.id}`,
                      rawId: inv.id,
                      type: 'invoice',
                      display_id: inv.display_id,
                      description: inv.payment_method
                        ? `Payment via ${inv.payment_method}`
                        : 'Invoice',
                      status: inv.status,
                      date: inv.paid_at || inv.created_at,
                      vehicleStr: vStr(inv.vehicle),
                      total: inv.total,
                    })),
                  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (timeline.length === 0) {
                    return <div className="text-sm text-slate-500">No service history yet.</div>;
                  }

                  return (
                    <div className="relative">
                      <div className="absolute left-3 top-0 bottom-0 w-px bg-bdr" />
                      <div className="space-y-0">
                        {timeline.map((item, i) => {
                          const isWo = item.type === 'wo';
                          const dotColor = i === 0 ? '#f97316' : '#252a35';
                          const date = new Date(item.date).toLocaleDateString();

                          return (
                            <Link
                              key={item.id}
                              href={isWo ? `/work-orders?open=${item.rawId}` : `/invoicing?open=${item.rawId}`}
                              className="relative pl-8 py-3 border-b border-bdr/50 last:border-0 block hover:bg-surface/30 transition cursor-pointer"
                            >
                              {/* Timeline dot */}
                              <div
                                className="absolute left-1.5 top-4 w-3 h-3 rounded-full border-2 bg-bg"
                                style={{ borderColor: dotColor }}
                              />

                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  {/* Type icon + description */}
                                  <div className="flex items-center gap-2 mb-1">
                                    <Icon
                                      d={isWo ? icons.wrench : icons.file}
                                      size={13}
                                      className={isWo ? 'text-blue-400 flex-shrink-0' : 'text-emerald-400 flex-shrink-0'}
                                    />
                                    <span className="text-sm text-slate-200 font-medium truncate">
                                      {item.description}
                                    </span>
                                  </div>

                                  {/* Meta row: vehicle, ID, status */}
                                  <div className="flex items-center gap-2 flex-wrap ml-5">
                                    <span className="text-xs text-slate-500">
                                      {item.vehicleStr && `${item.vehicleStr} · `}{item.display_id}
                                    </span>
                                    <StatusBadge status={item.status} />
                                  </div>
                                </div>

                                {/* Right side: date + total */}
                                <div className="text-right flex-shrink-0">
                                  <div className="text-xs text-slate-500">{date}</div>
                                  <div className="text-sm font-medium text-slate-200 mt-0.5">
                                    {fmt(item.total)}
                                  </div>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Service Reminders */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-heading font-bold text-sm text-slate-300 uppercase tracking-wider">
                    Service Reminders
                  </h4>
                  <button onClick={() => setShowAddReminder(!showAddReminder)}
                    className="text-accent hover:text-orange-400 text-[11px] font-heading font-bold uppercase tracking-wider flex items-center gap-1">
                    <Icon d={icons.plus} size={10} />Add Reminder
                  </button>
                </div>
                {showAddReminder && (
                  <div className="bg-bg border border-accent/30 rounded-lg p-3 mb-3 space-y-2">
                    <input value={rServiceType} onChange={e => setRServiceType(e.target.value)}
                      className={inputCls} placeholder="e.g. Oil Change, Inspection, Tire Rotation" />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-600 uppercase">Vehicle</label>
                        <select value={rVehicleId} onChange={e => setRVehicleId(e.target.value)} className={inputCls}>
                          <option value="">Select...</option>
                          {c.vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-600 uppercase">Due Date</label>
                        <input type="date" value={rDueDate} onChange={e => setRDueDate(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-600 uppercase">Due Mileage</label>
                        <input type="number" value={rDueMileage} onChange={e => setRDueMileage(e.target.value)} className={inputCls} placeholder="e.g. 50000" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Btn small onClick={async () => {
                        if (!rServiceType.trim() || !rVehicleId) return;
                        await fetch('/api/service-reminders', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            vehicle_id: rVehicleId, customer_id: c.id, service_type: rServiceType,
                            due_date: rDueDate || null, due_mileage: rDueMileage ? parseInt(rDueMileage) : null,
                          }),
                        });
                        setRServiceType(''); setRDueDate(''); setRDueMileage(''); setRVehicleId(''); setShowAddReminder(false);
                        const rd = await fetch(`/api/service-reminders?customer_id=${c.id}`).then(r => r.json());
                        setReminders(Array.isArray(rd) ? rd : []);
                      }}>Save</Btn>
                      <Btn small variant="ghost" onClick={() => setShowAddReminder(false)}>Cancel</Btn>
                    </div>
                  </div>
                )}
                {reminders.filter(r => r.status === 'Pending').length > 0 ? (
                  <div className="space-y-2">
                    {reminders.filter(r => r.status === 'Pending').map(r => (
                      <div key={r.id} className="bg-bg rounded-lg p-3 border border-bdr flex items-center justify-between">
                        <div>
                          <div className="text-sm text-white font-medium">{r.service_type}</div>
                          <div className="text-xs text-slate-500">
                            {r.vehicle ? `${r.vehicle.year || ''} ${r.vehicle.make} ${r.vehicle.model}` : ''}
                            {r.due_date ? ` · Due ${new Date(r.due_date).toLocaleDateString()}` : ''}
                            {r.due_mileage ? ` · ${r.due_mileage.toLocaleString()} mi` : ''}
                          </div>
                        </div>
                        <button onClick={async () => {
                          await fetch(`/api/service-reminders/${r.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'Completed' }),
                          });
                          const rd = await fetch(`/api/service-reminders?customer_id=${c.id}`).then(res => res.json());
                          setReminders(Array.isArray(rd) ? rd : []);
                        }} className="text-xs text-success hover:text-green-400 font-heading font-semibold uppercase tracking-wider">
                          Done
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No pending reminders.</div>
                )}
              </div>
            </div>
          );
        })()}
      </SlideOver>

      {/* Quick Action Modals */}
      {selectedCustomer && (
        <>
          <NewWOModal
            open={showQuickWO}
            onClose={() => setShowQuickWO(false)}
            techs={techs}
            onCreated={() => { fetchCustomers(search); refreshDetail(selectedCustomer.id); }}
            defaultLaborRate={shopSettings?.default_labor_rate ? Number(shopSettings.default_labor_rate) : 125}
            defaultCustomer={selectedCustomer}
            defaultVehicles={selectedCustomer.vehicles}
          />
          <NewEstimateModal
            open={showQuickEstimate}
            onClose={() => setShowQuickEstimate(false)}
            onCreated={() => { setShowQuickEstimate(false); fetchCustomers(search); refreshDetail(selectedCustomer.id); }}
            defaultRate={shopSettings?.default_labor_rate ? Number(shopSettings.default_labor_rate) : 125}
            defaultCustomer={selectedCustomer}
            defaultVehicles={selectedCustomer.vehicles}
          />
        </>
      )}
    </div>
  );
}
