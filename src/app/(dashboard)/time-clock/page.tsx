'use client';

import { useState, useEffect, useCallback } from 'react';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';
import type { Tech, TimeEntry, WorkOrder } from '@/lib/types';

function elapsed(clockIn: string): string {
  const ms = Date.now() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function durationStr(minutes: number | null): string {
  if (!minutes) return '0h 00m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

export default function TimeClockPage() {
  const [techs, setTechs] = useState<Tech[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const [clockOutConfirm, setClockOutConfirm] = useState<{ techId: string; shiftId: string; activeJobIds: string[] } | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');

  const load = useCallback(async () => {
    const [t, e, w] = await Promise.all([
      fetch('/api/techs').then(r => r.json()),
      fetch('/api/time-clock').then(r => r.json()),
      fetch('/api/work-orders').then(r => r.json()),
    ]);
    if (Array.isArray(t)) setTechs(t);
    if (Array.isArray(e)) setEntries(e);
    const woArr = Array.isArray(w) ? w : w?.data ?? [];
    setWorkOrders(woArr);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tick every 5s to update live timers
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const clockIn = async (techId: string) => {
    const res = await fetch('/api/time-clock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech_id: techId, type: 'shift' }),
    });
    if (res.ok) load();
  };

  const clockOut = async (entryId: string) => {
    const res = await fetch(`/api/time-clock/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clock_out: new Date().toISOString() }),
    });
    if (res.ok) load();
  };

  const saveTimeEdit = async (entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    // Build ISO timestamps using the original date but new times
    const date = entry.clock_in.slice(0, 10); // YYYY-MM-DD
    const clockInISO = `${date}T${editClockIn}:00`;
    const clockOutISO = `${date}T${editClockOut}:00`;

    const res = await fetch(`/api/time-clock/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clock_in: clockInISO, clock_out: clockOutISO }),
    });
    if (res.ok) {
      setEditingEntry(null);
      load();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to update');
    }
  };

  // Today's entries for summary
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter(e => e.clock_in.slice(0, 10) === today);

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-white text-xl tracking-wide">Time Clock</h1>
        <span className="text-sm text-slate-400">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* Tech Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {techs.map(tech => {
          const activeShift = entries.find(
            e => e.tech_id === tech.id && e.type === 'shift' && !e.clock_out
          );
          const activeJobs = entries.filter(
            e => e.tech_id === tech.id && e.type === 'job' && !e.clock_out
          );
          const todayShifts = todayEntries.filter(
            e => e.tech_id === tech.id && e.type === 'shift'
          );
          const todayShiftMinutes = todayShifts.reduce((sum, e) => {
            if (e.clock_out) return sum + (e.duration_minutes || 0);
            // Active shift — calc live
            return sum + Math.round((Date.now() - new Date(e.clock_in).getTime()) / 60000);
          }, 0);

          const isClockedIn = !!activeShift;

          return (
            <div
              key={tech.id}
              className={`bg-card border rounded-xl p-5 transition ${
                isClockedIn ? 'border-green-500/30' : 'border-bdr'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: tech.color + '20', color: tech.color }}
                  >
                    {tech.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{tech.name}</div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isClockedIn ? 'bg-green-400 animate-pulse' : 'bg-slate-600'
                        }`}
                      />
                      <span className={`text-xs ${isClockedIn ? 'text-green-400' : 'text-slate-500'}`}>
                        {isClockedIn ? 'Clocked In' : 'Off'}
                      </span>
                    </div>
                  </div>
                </div>
                {isClockedIn ? (
                  <Btn variant="ghost" small onClick={() => {
                    if (activeJobs.length > 0) {
                      setClockOutConfirm({ techId: tech.id, shiftId: activeShift.id, activeJobIds: activeJobs.map(j => j.id) });
                    } else {
                      clockOut(activeShift.id);
                    }
                  }}>
                    Clock Out
                  </Btn>
                ) : (
                  <Btn small onClick={() => clockIn(tech.id)}>
                    Clock In
                  </Btn>
                )}
              </div>

              {/* Active shift timer */}
              {isClockedIn && (
                <div className="bg-bg rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon d={icons.clock} size={14} stroke="#22c55e" />
                    <span className="text-xs text-slate-400">Shift</span>
                  </div>
                  <span className="text-sm font-heading font-bold text-green-400" key={tick}>
                    {elapsed(activeShift.clock_in)}
                  </span>
                </div>
              )}

              {/* Active job timers */}
              {activeJobs.map(job => (
                <div key={job.id} className="bg-bg rounded-lg px-3 py-2 mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon d={icons.wrench} size={14} stroke="#f97316" />
                    <span className="text-xs text-slate-300 truncate">
                      {job.work_order?.display_id} — {job.work_order?.job}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-heading font-bold text-orange-400" key={tick}>
                      {elapsed(job.clock_in)}
                    </span>
                    <button
                      onClick={() => clockOut(job.id)}
                      className="text-slate-500 hover:text-red-400 transition"
                      title="Stop timer"
                    >
                      <Icon d={icons.x} size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {/* Assigned Jobs */}
              {(() => {
                const assignedWOs = workOrders.filter(
                  w => w.tech_id === tech.id && w.status !== 'Completed'
                );
                if (assignedWOs.length === 0) return null;
                // Filter out WOs that already have an active timer
                const activeWoIds = new Set(activeJobs.map(j => j.work_order_id));
                const woWithoutTimer = assignedWOs.filter(w => !activeWoIds.has(w.id));
                if (woWithoutTimer.length === 0) return null;
                return (
                  <div className="space-y-1.5 mb-3">
                    <span className="text-[10px] font-heading font-bold text-slate-600 uppercase tracking-wider">Assigned Jobs</span>
                    {woWithoutTimer.map(w => (
                      <div key={w.id} className="bg-bg rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs text-accent font-heading font-bold">{w.display_id}</span>
                          <span className="text-xs text-slate-400 ml-1.5 truncate">{w.job}</span>
                        </div>
                        <button
                          onClick={async () => {
                            await fetch('/api/time-clock', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ tech_id: tech.id, type: 'job', work_order_id: w.id }),
                            });
                            load();
                          }}
                          className="shrink-0 text-[10px] font-heading font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1 hover:bg-orange-500/20 transition"
                        >
                          Start Timer
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Today's total */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-bdr">
                <span className="text-[10px] font-heading font-bold text-slate-500 uppercase tracking-wider">Today&apos;s Hours</span>
                <span className="text-sm font-heading font-bold text-slate-300">
                  {durationStr(todayShiftMinutes)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Today's Log */}
      <div className="bg-card border border-bdr rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-bdr">
          <h3 className="font-heading font-bold text-white tracking-wide">Today&apos;s Time Log</h3>
        </div>
        <div className="divide-y divide-bdr max-h-[400px] overflow-y-auto">
          {todayEntries.length === 0 && (
            <div className="px-5 py-8 text-center">
              <Icon d={icons.clock} size={28} stroke="#334155" className="mx-auto mb-2" />
              <p className="text-sm text-slate-500">No entries today</p>
            </div>
          )}
          {todayEntries.map(entry => {
            const techObj = techs.find(t => t.id === entry.tech_id) || entry.tech;
            const isEditing = editingEntry === entry.id;
            const clockInTime = new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const clockOutTime = entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

            return (
              <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-1 h-9 rounded-full shrink-0" style={{ background: techObj?.color || '#64748b' }} />
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: (techObj?.color || '#64748b') + '20', color: techObj?.color || '#64748b' }}>
                  {(techObj?.name || '?').split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium">
                    {techObj?.name}
                    <span className={`ml-2 text-[10px] uppercase font-heading font-bold px-1.5 py-0.5 rounded ${
                      entry.type === 'shift' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'
                    }`}>{entry.type}</span>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input type="time" value={editClockIn}
                        onChange={e => setEditClockIn(e.target.value)}
                        className="bg-bg border border-bdr rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/50" />
                      <span className="text-slate-500">&mdash;</span>
                      <input type="time" value={editClockOut}
                        onChange={e => setEditClockOut(e.target.value)}
                        className="bg-bg border border-bdr rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/50" />
                      <button onClick={() => saveTimeEdit(entry.id)}
                        className="text-accent hover:text-orange-300 transition">
                        <Icon d={icons.check} size={14} />
                      </button>
                      <button onClick={() => setEditingEntry(null)}
                        className="text-slate-500 hover:text-slate-300 transition">
                        <Icon d={icons.x} size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 truncate">
                      {clockInTime}{clockOutTime ? ` — ${clockOutTime}` : ' — active'}
                      {entry.type === 'job' && entry.work_order && (
                        <span className="ml-1">· {entry.work_order.display_id}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <span className={`text-sm font-heading font-bold ${entry.clock_out ? 'text-slate-300' : 'text-green-400'}`}>
                    {entry.clock_out ? durationStr(entry.duration_minutes) : elapsed(entry.clock_in)}
                  </span>
                  {entry.clock_out && !isEditing && (
                    <button
                      onClick={() => {
                        setEditingEntry(entry.id);
                        const cin = new Date(entry.clock_in);
                        const cout = new Date(entry.clock_out!);
                        setEditClockIn(`${String(cin.getHours()).padStart(2,'0')}:${String(cin.getMinutes()).padStart(2,'0')}`);
                        setEditClockOut(`${String(cout.getHours()).padStart(2,'0')}:${String(cout.getMinutes()).padStart(2,'0')}`);
                      }}
                      className="text-slate-600 hover:text-slate-400 transition"
                      title="Edit times"
                    >
                      <Icon d={icons.edit} size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {clockOutConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-bdr rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-heading font-bold text-white text-lg mb-2">Active Job Timers</h3>
            <p className="text-sm text-slate-400 mb-4">
              You have {clockOutConfirm.activeJobIds.length} active job timer{clockOutConfirm.activeJobIds.length > 1 ? 's' : ''} running. Stop {clockOutConfirm.activeJobIds.length > 1 ? 'them' : 'it'} and clock out?
            </p>
            <div className="flex gap-3">
              <Btn
                onClick={async () => {
                  // Stop all job timers in parallel, then clock out shift
                  const results = await Promise.allSettled(
                    clockOutConfirm.activeJobIds.map(jobId =>
                      fetch(`/api/time-clock/${jobId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clock_out: new Date().toISOString() }),
                      })
                    )
                  );
                  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
                  if (failed > 0) {
                    alert(`${failed} job timer${failed > 1 ? 's' : ''} failed to stop. Check the time clock.`);
                  }
                  await clockOut(clockOutConfirm.shiftId);
                  setClockOutConfirm(null);
                }}
                variant="danger"
              >
                Stop Timers &amp; Clock Out
              </Btn>
              <Btn variant="secondary" onClick={() => setClockOutConfirm(null)}>
                Cancel
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
