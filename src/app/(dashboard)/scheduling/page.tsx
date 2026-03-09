'use client';

import { useState, useEffect, useMemo } from 'react';
import { Btn } from '@/components/ui/Btn';
import { Icon, icons } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { formatTime, getWeekDates, formatShortDate, formatDayName } from '@/lib/utils';
import { shopConfig } from '@/lib/config';
import type { Tech, Appointment, Customer } from '@/lib/types';

const SERVICE_TYPES = [
  'Oil Change', 'Brake Service', 'Diagnostic', 'Tire Service',
  'Transmission', 'A/C Service', 'General Repair', 'Scheduled Maintenance',
];

const DURATION_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '2.5 hours', value: 150 },
  { label: '3 hours', value: 180 },
  { label: '4 hours', value: 240 },
];

export default function SchedulingPage() {
  const [selectedDay, setSelectedDay] = useState(0);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formCustomer, setFormCustomer] = useState('');
  const [formVehicle, setFormVehicle] = useState('');
  const [formService, setFormService] = useState(SERVICE_TYPES[0]);
  const [formTechId, setFormTechId] = useState('');
  const [formDay, setFormDay] = useState(0);
  const [formTime, setFormTime] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  // Customer search results
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [customerVehicles, setCustomerVehicles] = useState<{ id: string; year: number | null; make: string; model: string }[]>([]);

  const hourHeight = 64;
  const hoursStart = shopConfig.hoursStart;
  const hoursEnd = shopConfig.hoursEnd;
  const hours = Array.from({ length: hoursEnd - hoursStart }, (_, i) => hoursStart + i);

  const weekDates = useMemo(() => getWeekDates(new Date()), []);

  // Time slot options (half-hour increments)
  const timeSlots = useMemo(() => {
    const slots: { label: string; value: string }[] = [];
    for (const h of hours) {
      for (const m of [0, 30]) {
        const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const label = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
        const value = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        slots.push({ label, value });
      }
    }
    return slots;
  }, [hours]);

  // Fetch techs
  useEffect(() => {
    fetch('/api/techs').then(r => r.json()).then(setTechs);
  }, []);

  // Fetch appointments for the week
  useEffect(() => {
    if (weekDates.length === 0) return;
    const start = weekDates[0].toISOString().split('T')[0];
    const endDate = new Date(weekDates[4]);
    endDate.setDate(endDate.getDate() + 1);
    const end = endDate.toISOString().split('T')[0];
    fetch(`/api/appointments?start=${start}&end=${end}`)
      .then(r => r.json())
      .then(data => { setAppointments(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [weekDates]);

  // Filter appointments for selected day
  const dayAppts = useMemo(() => {
    if (!weekDates[selectedDay]) return [];
    const dayStr = weekDates[selectedDay].toISOString().split('T')[0];
    return appointments.filter(a => {
      const aDate = new Date(a.start_time).toISOString().split('T')[0];
      return aDate === dayStr;
    });
  }, [appointments, selectedDay, weekDates]);

  // Customer search
  useEffect(() => {
    if (formCustomer.length < 2) { setCustomerResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(formCustomer)}`)
        .then(r => r.json())
        .then(setCustomerResults);
    }, 300);
    return () => clearTimeout(timer);
  }, [formCustomer]);

  // Fetch vehicles when customer selected
  useEffect(() => {
    if (!selectedCustomerId) { setCustomerVehicles([]); return; }
    fetch(`/api/customers/${selectedCustomerId}`)
      .then(r => r.json())
      .then(data => setCustomerVehicles(data.vehicles || []));
  }, [selectedCustomerId]);

  // Set defaults when techs load
  useEffect(() => {
    if (techs.length > 0 && !formTechId) setFormTechId(techs[0].id);
  }, [techs, formTechId]);

  useEffect(() => {
    if (timeSlots.length > 0 && !formTime) setFormTime(timeSlots[0].value);
  }, [timeSlots, formTime]);

  const resetForm = () => {
    setFormCustomer('');
    setFormVehicle('');
    setFormService(SERVICE_TYPES[0]);
    setFormTechId(techs[0]?.id || '');
    setFormDay(0);
    setFormTime(timeSlots[0]?.value || '');
    setFormDuration(60);
    setSelectedCustomerId('');
    setSelectedVehicleId('');
    setCustomerResults([]);
    setCustomerVehicles([]);
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) return;
    setSubmitting(true);
    const date = weekDates[formDay];
    const [h, m] = formTime.split(':').map(Number);
    const startTime = new Date(date);
    startTime.setHours(h, m, 0, 0);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          vehicle_id: selectedVehicleId || null,
          tech_id: formTechId,
          job: formService,
          start_time: startTime.toISOString(),
          duration_minutes: formDuration,
        }),
      });
      if (res.ok) {
        const newAppt = await res.json();
        setAppointments(prev => [...prev, newAppt]);
        setShowNewAppt(false);
        resetForm();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const activeTechs = techs.filter(t => t.active);

  const inputClass = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const selectClass = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-accent/50 font-body';
  const labelClass = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-24 bg-card border border-bdr rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="h-10 w-40 bg-card border border-bdr rounded-lg animate-pulse" />
        </div>
        <div className="bg-card border border-bdr rounded-xl h-[600px] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Day tabs + New Appointment */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {weekDates.map((d, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`px-4 py-2 rounded-lg font-heading font-semibold text-sm tracking-wider transition ${
                selectedDay === i
                  ? 'bg-accent text-white'
                  : 'bg-card text-slate-400 hover:text-white border border-bdr'
              }`}
            >
              {formatDayName(d)}{' '}
              <span className="text-xs font-body opacity-70">{formatShortDate(d)}</span>
            </button>
          ))}
        </div>
        <Btn onClick={() => setShowNewAppt(true)}>
          <span className="flex items-center gap-2">
            <Icon d={icons.plus} size={16} />
            New Appointment
          </span>
        </Btn>
      </div>

      {/* Calendar Grid */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        {/* Tech headers */}
        <div
          className="grid border-b border-bdr"
          style={{ gridTemplateColumns: `64px repeat(${activeTechs.length}, 1fr)` }}
        >
          <div className="bg-surface p-3" />
          {activeTechs.map(t => (
            <div key={t.id} className="p-3 border-l border-bdr flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: t.color }} />
              <span className="font-heading font-semibold text-sm text-slate-200 tracking-wide">
                {t.name}
              </span>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `64px repeat(${activeTechs.length}, 1fr)` }}
        >
          {/* Time labels */}
          <div className="bg-surface/50">
            {hours.map(h => (
              <div
                key={h}
                className="border-b border-bdr flex items-start justify-end pr-3 pt-1 text-[11px] text-slate-500 font-heading"
                style={{ height: hourHeight }}
              >
                {h > 12 ? h - 12 : h}
                {h >= 12 ? 'PM' : 'AM'}
              </div>
            ))}
          </div>

          {/* Tech columns */}
          {activeTechs.map(t => (
            <div key={t.id} className="relative border-l border-bdr">
              {hours.map(h => (
                <div key={h} className="border-b border-bdr" style={{ height: hourHeight }} />
              ))}
              {/* Appointment blocks */}
              {dayAppts
                .filter(a => a.tech?.id === t.id || a.tech_id === t.id)
                .map(a => {
                  const startDate = new Date(a.start_time);
                  const startHour = startDate.getHours();
                  const startMin = startDate.getMinutes();
                  const top = ((startHour - hoursStart) * 60 + startMin) / 60 * hourHeight;
                  const height = (a.duration_minutes / 60) * hourHeight;
                  const durationHours = a.duration_minutes / 60;
                  const customerName = a.customer?.name || '';
                  const vehicle = a.vehicle
                    ? `${a.vehicle.year || ''} ${a.vehicle.make} ${a.vehicle.model}`.trim()
                    : '';

                  return (
                    <div
                      key={a.id}
                      className="absolute left-1 right-1 rounded-lg p-2 overflow-hidden cursor-pointer hover:opacity-90 transition border"
                      style={{
                        top,
                        height,
                        background: t.color + '18',
                        borderColor: t.color + '40',
                      }}
                    >
                      <div className="text-[11px] font-semibold truncate" style={{ color: t.color }}>
                        {formatTime(a.start_time)} · {durationHours}h
                      </div>
                      <div className="text-xs text-slate-200 font-medium truncate mt-0.5">
                        {customerName}
                      </div>
                      {height > 50 && (
                        <div className="text-[11px] text-slate-400 truncate">{vehicle}</div>
                      )}
                      {height > 65 && (
                        <div className="text-[11px] text-slate-500 truncate">{a.job}</div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      {/* New Appointment Modal */}
      <Modal open={showNewAppt} onClose={() => { setShowNewAppt(false); resetForm(); }} title="New Appointment">
        <div className="space-y-4">
          {/* Customer search */}
          <div className="relative">
            <label className={labelClass}>Customer</label>
            <input
              className={inputClass}
              placeholder="Search customer name..."
              value={formCustomer}
              onChange={e => {
                setFormCustomer(e.target.value);
                setSelectedCustomerId('');
                setSelectedVehicleId('');
              }}
            />
            {customerResults.length > 0 && !selectedCustomerId && (
              <div className="absolute z-10 w-full mt-1 bg-card border border-bdr rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {customerResults.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-surface/50 transition"
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setFormCustomer(c.name);
                      setCustomerResults([]);
                    }}
                  >
                    {c.name}
                    {c.email && <span className="text-xs text-slate-500 ml-2">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Vehicle</label>
              <select
                className={selectClass}
                value={selectedVehicleId}
                onChange={e => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Select vehicle...</option>
                {customerVehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Service Type</label>
              <select
                className={selectClass}
                value={formService}
                onChange={e => setFormService(e.target.value)}
              >
                {SERVICE_TYPES.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Technician</label>
              <select
                className={selectClass}
                value={formTechId}
                onChange={e => setFormTechId(e.target.value)}
              >
                {activeTechs.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <select
                className={selectClass}
                value={formDay}
                onChange={e => setFormDay(Number(e.target.value))}
              >
                {weekDates.map((d, i) => (
                  <option key={i} value={i}>
                    {formatDayName(d)} {formatShortDate(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Time</label>
              <select
                className={selectClass}
                value={formTime}
                onChange={e => setFormTime(e.target.value)}
              >
                {timeSlots.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Est. Duration</label>
              <select
                className={selectClass}
                value={formDuration}
                onChange={e => setFormDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" onClick={() => { setShowNewAppt(false); resetForm(); }}>
              Cancel
            </Btn>
            <Btn onClick={handleSubmit} disabled={!selectedCustomerId || submitting}>
              {submitting ? 'Scheduling...' : 'Schedule Appointment'}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
