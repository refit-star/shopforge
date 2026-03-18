'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Btn } from '@/components/ui/Btn';
import { Icon, icons } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { getWeekDates, formatShortDate, formatDayName } from '@/lib/utils';
import type { Tech, Appointment, Customer, ShopSettings, Notification, WorkOrder } from '@/lib/types';

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
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scheduledWOs, setScheduledWOs] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  // Form state
  const [formCustomer, setFormCustomer] = useState('');
  const [formVehicle, setFormVehicle] = useState('');
  const [formService, setFormService] = useState(SERVICE_TYPES[0]);
  const [formTechId, setFormTechId] = useState('');
  const [formDay, setFormDay] = useState(0);
  const [formTime, setFormTime] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  // Appointment detail / check-in state
  const [activeAppt, setActiveAppt] = useState<Appointment | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; created: boolean; woId: string } | null>(null);
  const router = useRouter();

  // Reminder state
  const [reminderData, setReminderData] = useState<Notification | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderActionLoading, setReminderActionLoading] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);
  const [reminderCancelled, setReminderCancelled] = useState(false);

  // Customer search results
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [customerVehicles, setCustomerVehicles] = useState<{ id: string; year: number | null; make: string; model: string }[]>([]);

  const hourHeight = 64;
  const hoursStart = shopSettings?.hours_start ?? 8;
  const hoursEnd = shopSettings?.hours_end ?? 18;
  const hours = Array.from({ length: hoursEnd - hoursStart }, (_, i) => hoursStart + i);

  const weekDates = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    return getWeekDates(base);
  }, [weekOffset]);

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

  // Fetch techs & settings
  useEffect(() => {
    fetch('/api/techs').then(r => r.json()).then(setTechs);
    fetch('/api/settings').then(r => r.json()).then(setShopSettings);
  }, []);

  // Fetch appointments + scheduled WOs for the week
  useEffect(() => {
    if (weekDates.length === 0) return;
    const toLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const start = toLocal(weekDates[0]);
    const endDate = new Date(weekDates[4]);
    endDate.setDate(endDate.getDate() + 1);
    const end = toLocal(endDate);
    Promise.all([
      fetch(`/api/appointments?start=${start}&end=${end}`).then(r => r.json()),
      fetch(`/api/work-orders?status=Scheduled&scheduled_from=${start}&scheduled_to=${end}`).then(r => r.json()).then(d => Array.isArray(d) ? d : d.data ?? []),
    ])
      .then(([appts, wos]) => { setAppointments(appts); setScheduledWOs(wos); setLoading(false); })
      .catch(() => setLoading(false));
  }, [weekDates]);

  // Helper: format time from UTC hours (shop time stored as UTC)
  const fmtApptTime = (isoStr: string) => {
    const d = new Date(isoStr);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'p' : 'a';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
  };

  // Filter appointments for selected day (compare UTC dates since shop time is stored as UTC)
  const dayAppts = useMemo(() => {
    if (!weekDates[selectedDay]) return [];
    const wd = weekDates[selectedDay];
    const dayStr = `${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,'0')}-${String(wd.getDate()).padStart(2,'0')}`;
    return appointments.filter(a => {
      const ad = new Date(a.start_time);
      const aDate = `${ad.getUTCFullYear()}-${String(ad.getUTCMonth()+1).padStart(2,'0')}-${String(ad.getUTCDate()).padStart(2,'0')}`;
      return aDate === dayStr;
    });
  }, [appointments, selectedDay, weekDates]);

  // Filter scheduled WOs for selected day
  const dayScheduledWOs = useMemo(() => {
    if (!weekDates[selectedDay]) return [];
    const wd = weekDates[selectedDay];
    const dayStr = `${wd.getFullYear()}-${String(wd.getMonth()+1).padStart(2,'0')}-${String(wd.getDate()).padStart(2,'0')}`;
    return scheduledWOs.filter(w => w.scheduled_date === dayStr);
  }, [scheduledWOs, selectedDay, weekDates]);

  // Customer search
  useEffect(() => {
    if (formCustomer.length < 2) { setCustomerResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/customers?q=${encodeURIComponent(formCustomer)}`)
        .then(r => r.json())
        .then(json => Array.isArray(json) ? json : json.data ?? [])
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

  const openApptDetail = (appt: Appointment) => {
    setActiveAppt(appt);
    setCheckInResult(null);
    setReminderData(null);
    setReminderSent(false);
    setReminderCancelled(false);
    // Fetch reminder status
    setReminderLoading(true);
    fetch(`/api/appointments/${appt.id}/reminder`)
      .then(r => r.json())
      .then(data => {
        setReminderData(data.reminder || null);
      })
      .catch(() => {})
      .finally(() => setReminderLoading(false));
  };

  const handleCheckIn = async (appt: Appointment) => {
    setCheckingIn(true);
    try {
      const res = await fetch(`/api/appointments/${appt.id}/check-in`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCheckInResult({ success: true, created: data.created, woId: data.work_order_id });
        // Auto-navigate to the created/updated WO detail
        setTimeout(() => {
          router.push(`/work-orders?open=${data.work_order_id}`);
        }, 1500);
      } else {
        const err = await res.json();
        alert(err.error || 'Check-in failed');
      }
    } catch {
      alert('Check-in failed — network error');
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSendReminder = async (apptId: string) => {
    setReminderActionLoading(true);
    try {
      const res = await fetch(`/api/appointments/${apptId}/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      if (res.ok) {
        const data = await res.json();
        setReminderData(data.reminder);
        setReminderSent(true);
      } else {
        const err = await res.json();
        if (err.error?.includes('not configured')) {
          alert(err.error);
        } else {
          alert('Failed to send reminder: ' + (err.error || 'Unknown error'));
        }
      }
    } catch {
      alert('Failed to send reminder');
    } finally {
      setReminderActionLoading(false);
    }
  };

  const handleCancelReminder = async (apptId: string) => {
    setReminderActionLoading(true);
    try {
      const res = await fetch(`/api/appointments/${apptId}/reminder`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setReminderData(null);
        setReminderCancelled(true);
        // Update the appointment's has_reminder in the list
        setAppointments(prev =>
          prev.map(a => a.id === apptId ? { ...a, has_reminder: false } : a)
        );
      }
    } catch {
      alert('Failed to cancel reminder');
    } finally {
      setReminderActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCustomerId) return;
    setSubmitting(true);
    const date = weekDates[formDay];
    // Store shop time directly as UTC so it round-trips correctly
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${formTime}:00.000Z`;

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          vehicle_id: selectedVehicleId || null,
          tech_id: formTechId,
          job: formService,
          start_time: dateStr,
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

  // Unassigned appointments for selected day
  const unassignedAppts = useMemo(() => {
    return dayAppts.filter(a => !a.tech_id && !a.tech);
  }, [dayAppts]);

  const handleAssignTech = async (apptId: string, techId: string) => {
    const res = await fetch(`/api/appointments/${apptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech_id: techId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAppointments(prev => prev.map(a => a.id === apptId ? updated : a));
      // If the detail modal is open for this appointment, update it
      if (activeAppt?.id === apptId) setActiveAppt(updated);
    }
  };

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
      {/* Week nav + Day tabs + New Appointment */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setWeekOffset(o => o - 1); setSelectedDay(0); }}
              className="p-2 rounded-lg bg-card border border-bdr text-slate-400 hover:text-white transition"
              title="Previous week"
            >
              <Icon d={icons.chevLeft} size={16} />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => { setWeekOffset(0); setSelectedDay(0); }}
                className="px-3 py-1.5 rounded-lg bg-card border border-bdr text-xs font-heading font-semibold text-slate-400 hover:text-white uppercase tracking-wider transition"
              >
                Today
              </button>
            )}
            <button
              onClick={() => { setWeekOffset(o => o + 1); setSelectedDay(0); }}
              className="p-2 rounded-lg bg-card border border-bdr text-slate-400 hover:text-white transition"
              title="Next week"
            >
              <Icon d={icons.chevRight} size={16} />
            </button>
            <span className="text-sm text-slate-500 font-body ml-2">
              {formatShortDate(weekDates[0])} – {formatShortDate(weekDates[4])}
            </span>
          </div>
          <Btn onClick={() => setShowNewAppt(true)}>
            <span className="flex items-center gap-2">
              <Icon d={icons.plus} size={16} />
              New Appointment
            </span>
          </Btn>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
          {weekDates.map((d, i) => (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-heading font-semibold text-sm tracking-wider transition whitespace-nowrap shrink-0 ${
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
      </div>

      {/* Unassigned Appointments Banner */}
      {unassignedAppts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Icon d={icons.alert} size={14} stroke="#f59e0b" />
            </div>
            <span className="font-heading font-semibold text-sm text-amber-400 tracking-wide">
              {unassignedAppts.length} Unassigned Booking{unassignedAppts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {unassignedAppts.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 bg-bg/50 rounded-lg px-3 py-2.5 border border-bdr">
                <div className="flex items-center gap-3 min-w-0">
                  {a.source === 'online' && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-400 font-bold leading-none">WEB</span>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 font-medium truncate">
                      {a.customer?.name || 'Unknown'} — {a.job}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {fmtApptTime(a.start_time)} · {a.duration_minutes >= 60 ? `${a.duration_minutes / 60}h` : `${a.duration_minutes}m`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    className="bg-bg border border-bdr rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-accent/50"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) handleAssignTech(a.id, e.target.value);
                    }}
                  >
                    <option value="" disabled>Assign tech...</option>
                    {activeTechs.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden overflow-x-auto">
        {/* Tech headers */}
        <div
          className="grid border-b border-bdr"
          style={{ gridTemplateColumns: `64px repeat(${activeTechs.length}, minmax(150px, 1fr))` }}
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

        {/* Scheduled Work Orders row */}
        {dayScheduledWOs.length > 0 && (
          <div
            className="grid border-b border-bdr"
            style={{ gridTemplateColumns: `64px repeat(${activeTechs.length}, minmax(150px, 1fr))` }}
          >
            <div className="bg-surface/50 flex items-center justify-end pr-3 py-2">
              <span className="text-[10px] text-slate-500 font-heading uppercase tracking-wider">WOs</span>
            </div>
            {activeTechs.map(t => {
              const techWOs = dayScheduledWOs.filter(w => w.tech_id === t.id);
              return (
                <div key={t.id} className="border-l border-bdr p-1.5 flex flex-col gap-1">
                  {techWOs.map(w => {
                    const vehicle = w.vehicle ? `${w.vehicle.year || ''} ${w.vehicle.make} ${w.vehicle.model}`.trim() : '';
                    return (
                      <button
                        key={w.id}
                        onClick={() => router.push(`/work-orders?open=${w.id}`)}
                        className="text-left rounded-md px-2 py-1.5 border transition hover:opacity-80"
                        style={{
                          background: (t.color || '#8b5cf6') + '18',
                          borderColor: (t.color || '#8b5cf6') + '40',
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold text-purple-400">{w.display_id}</span>
                          <Icon d={icons.wrench} size={9} className="text-purple-400" />
                        </div>
                        <div className="text-[11px] text-slate-200 font-medium truncate">{w.customer?.name}</div>
                        {vehicle && <div className="text-[10px] text-slate-500 truncate">{vehicle}</div>}
                        <div className="text-[10px] text-slate-500 truncate">{w.job}</div>
                      </button>
                    );
                  })}
                  {techWOs.length === 0 && (
                    <div className="h-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div
          className="relative grid overflow-hidden"
          style={{ gridTemplateColumns: `64px repeat(${activeTechs.length}, minmax(150px, 1fr))` }}
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
          {activeTechs.map(t => {
            const techAppts = dayAppts.filter(a => a.tech?.id === t.id || a.tech_id === t.id);

            // Compute overlap layout (Google Calendar style)
            const layoutMap = new Map<string, { col: number; totalCols: number }>();
            if (techAppts.length > 0) {
              const sorted = [...techAppts].sort((a, b) =>
                new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
              );

              // Find connected groups of overlapping appointments
              const getEnd = (a: Appointment) =>
                new Date(a.start_time).getTime() + a.duration_minutes * 60000;

              const groups: Appointment[][] = [];
              let currentGroup: Appointment[] = [sorted[0]];
              let groupEnd = getEnd(sorted[0]);

              for (let i = 1; i < sorted.length; i++) {
                const aStart = new Date(sorted[i].start_time).getTime();
                if (aStart < groupEnd) {
                  // overlaps with group
                  currentGroup.push(sorted[i]);
                  groupEnd = Math.max(groupEnd, getEnd(sorted[i]));
                } else {
                  groups.push(currentGroup);
                  currentGroup = [sorted[i]];
                  groupEnd = getEnd(sorted[i]);
                }
              }
              groups.push(currentGroup);

              // Assign columns within each group
              for (const group of groups) {
                const columns: Appointment[][] = [];
                for (const appt of group) {
                  const aStart = new Date(appt.start_time).getTime();
                  let placed = false;
                  for (let c = 0; c < columns.length; c++) {
                    const lastInCol = columns[c][columns[c].length - 1];
                    if (aStart >= getEnd(lastInCol)) {
                      columns[c].push(appt);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    columns.push([appt]);
                  }
                }
                const totalCols = columns.length;
                columns.forEach((col, colIdx) => {
                  col.forEach(appt => {
                    layoutMap.set(appt.id, { col: colIdx, totalCols });
                  });
                });
              }
            }

            return (
              <div key={t.id} className="relative border-l border-bdr overflow-hidden">
                {hours.map(h => (
                  <div key={h} className="border-b border-bdr" style={{ height: hourHeight }} />
                ))}
                {/* Appointment blocks */}
                {techAppts.map(a => {
                  const startDate = new Date(a.start_time);
                  const startHour = startDate.getUTCHours();
                  const startMin = startDate.getUTCMinutes();
                  const gridHeight = hours.length * hourHeight;
                  const rawTop = ((startHour - hoursStart) * 60 + startMin) / 60 * hourHeight;
                  const rawHeight = (a.duration_minutes / 60) * hourHeight;
                  const top = Math.max(0, rawTop);
                  const height = Math.min(rawHeight, gridHeight - top);
                  const durationHours = a.duration_minutes / 60;
                  const customerName = a.customer?.name || '';
                  const vehicle = a.vehicle
                    ? `${a.vehicle.year || ''} ${a.vehicle.make} ${a.vehicle.model}`.trim()
                    : '';
                  const isActive = activeAppt?.id === a.id;

                  // Overlap layout
                  const layout = layoutMap.get(a.id) || { col: 0, totalCols: 1 };
                  const colWidthPct = 100 / layout.totalCols;
                  const leftPct = layout.col * colWidthPct;

                  return (
                    <div
                      key={a.id}
                      className={`absolute rounded-lg p-1.5 overflow-hidden cursor-pointer hover:opacity-90 transition border ${isActive ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg z-10' : ''}`}
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${colWidthPct}% - 4px)`,
                        background: t.color + '18',
                        borderColor: isActive ? 'var(--accent)' : t.color + '40',
                      }}
                      onClick={() => openApptDetail(a)}
                    >
                      <div className="flex items-center gap-1 text-[11px] font-semibold truncate" style={{ color: t.color }}>
                        <span className="truncate">{fmtApptTime(a.start_time)} · {durationHours}h</span>
                        {a.source === 'online' && (
                          <span className="shrink-0 px-1 py-px rounded text-[9px] bg-blue-500/20 text-blue-400 font-bold leading-none">WEB</span>
                        )}
                        {a.has_reminder && (
                          <Icon d={icons.bell} size={10} stroke={t.color} className="shrink-0 opacity-70" />
                        )}
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
            );
          })}
        </div>
      </div>

      {/* Appointment Detail Modal */}
      <Modal
        open={!!activeAppt}
        onClose={() => { setActiveAppt(null); setCheckInResult(null); }}
        title="Appointment Details"
      >
        {activeAppt && (() => {
          const techObj = techs.find(t => t.id === (activeAppt.tech?.id || activeAppt.tech_id));
          const customerName = activeAppt.customer?.name || 'Unknown Customer';
          const vehicle = activeAppt.vehicle
            ? `${activeAppt.vehicle.year || ''} ${activeAppt.vehicle.make} ${activeAppt.vehicle.model}`.trim()
            : 'No vehicle';
          const durationHours = activeAppt.duration_minutes / 60;
          const startDate = new Date(activeAppt.start_time);
          const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

          return (
            <div className="space-y-4">
              {/* Customer & Vehicle */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                  <Icon d={icons.users} size={18} stroke="#f97316" />
                </div>
                <div>
                  <div className="text-sm font-heading font-bold text-white tracking-wide">{customerName}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{vehicle}</div>
                </div>
              </div>

              {/* Source badge */}
              {activeAppt.source === 'online' && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs font-heading font-semibold text-blue-400 tracking-wide">Online Booking</span>
                </div>
              )}

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface rounded-lg p-3 border border-bdr">
                  <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Service</div>
                  <div className="text-sm text-slate-200">{activeAppt.job}</div>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-bdr">
                  <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Technician</div>
                  {techObj ? (
                    <div className="text-sm text-slate-200 flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: techObj.color }} />
                      {techObj.name}
                    </div>
                  ) : (
                    <select
                      className="w-full bg-bg border border-amber-500/40 rounded-lg px-2 py-1.5 text-sm text-amber-400 focus:outline-none focus:border-accent/50"
                      defaultValue=""
                      onChange={e => {
                        if (e.target.value) handleAssignTech(activeAppt.id, e.target.value);
                      }}
                    >
                      <option value="" disabled>Assign tech...</option>
                      {activeTechs.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="bg-surface rounded-lg p-3 border border-bdr">
                  <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Date & Time</div>
                  <div className="text-sm text-slate-200">
                    {dateStr} at {fmtApptTime(activeAppt.start_time)}
                  </div>
                </div>
                <div className="bg-surface rounded-lg p-3 border border-bdr">
                  <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Duration</div>
                  <div className="text-sm text-slate-200">
                    {durationHours >= 1 ? `${durationHours}h` : `${activeAppt.duration_minutes}m`}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {activeAppt.notes && (
                <div className="bg-surface rounded-lg p-3 border border-bdr">
                  <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</div>
                  <div className="text-sm text-slate-300">{activeAppt.notes}</div>
                </div>
              )}

              {/* Reminder Section */}
              <div className="bg-surface rounded-lg p-3 border border-bdr">
                <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-2">Appointment Reminder</div>
                {reminderLoading ? (
                  <div className="text-xs text-slate-500">Loading reminder status...</div>
                ) : reminderSent ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                      <Icon d={icons.check} size={14} stroke="#22c55e" />
                    </div>
                    <div>
                      <div className="text-sm text-success font-heading font-semibold">Reminder Sent</div>
                      <div className="text-xs text-slate-500">SMS reminder has been sent to the customer.</div>
                    </div>
                  </div>
                ) : reminderCancelled ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center shrink-0">
                      <Icon d={icons.bell} size={14} stroke="#64748b" />
                    </div>
                    <div>
                      <div className="text-sm text-slate-400 font-heading font-semibold">Reminder Cancelled</div>
                      <div className="text-xs text-slate-500">The appointment reminder has been cancelled.</div>
                    </div>
                  </div>
                ) : reminderData ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <Icon d={icons.bell} size={14} stroke={reminderData.status === 'sent' ? '#22c55e' : '#f97316'} />
                      </div>
                      <div>
                        <div className="text-sm text-slate-200 font-heading font-semibold">
                          {reminderData.status === 'sent' ? 'Reminder Sent' : reminderData.status === 'cancelled' ? 'Reminder Cancelled' : 'Reminder Scheduled'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {reminderData.status === 'sent' ? 'SMS sent to customer' : reminderData.status === 'cancelled' ? 'Cancelled' : 'Pending SMS notification'}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 bg-bg/50 rounded p-2 border border-bdr">
                      {reminderData.message}
                    </div>
                    {reminderData.status === 'pending' && (
                      <div className="flex gap-2">
                        <Btn
                          small
                          variant="success"
                          onClick={() => handleSendReminder(activeAppt.id)}
                          disabled={reminderActionLoading}
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon d={icons.send} size={12} />
                            {reminderActionLoading ? 'Sending...' : 'Send Reminder Now'}
                          </span>
                        </Btn>
                        <Btn
                          small
                          variant="ghost"
                          onClick={() => handleCancelReminder(activeAppt.id)}
                          disabled={reminderActionLoading}
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon d={icons.x} size={12} />
                            Cancel Reminder
                          </span>
                        </Btn>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center shrink-0">
                      <Icon d={icons.bell} size={14} stroke="#64748b" />
                    </div>
                    <div className="text-sm text-slate-500">No reminder set</div>
                  </div>
                )}
              </div>

              {/* Check-In Result */}
              {checkInResult && checkInResult.success && (
                <div className="bg-success/10 border border-success/30 rounded-lg p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center shrink-0">
                    <Icon d={icons.check} size={16} stroke="#22c55e" />
                  </div>
                  <div>
                    <div className="text-sm font-heading font-bold text-success tracking-wide">Checked In</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {checkInResult.created
                        ? 'New work order created with Check-In status.'
                        : 'Existing work order moved to Check-In status.'}
                      {' '}Redirecting to work orders...
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-bdr">
                <Btn
                  variant="secondary"
                  onClick={() => { setActiveAppt(null); setCheckInResult(null); }}
                >
                  Close
                </Btn>
                {!checkInResult && (
                  <Btn
                    variant="success"
                    onClick={() => handleCheckIn(activeAppt)}
                    disabled={checkingIn || !activeAppt.vehicle_id}
                  >
                    <span className="flex items-center gap-2">
                      <Icon d={icons.check} size={16} />
                      {checkingIn ? 'Checking In...' : 'Check In'}
                    </span>
                  </Btn>
                )}
              </div>

              {!activeAppt.vehicle_id && !checkInResult && (
                <p className="text-xs text-slate-500 text-right -mt-2">
                  A vehicle is required to check in.
                </p>
              )}
            </div>
          );
        })()}
      </Modal>

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
