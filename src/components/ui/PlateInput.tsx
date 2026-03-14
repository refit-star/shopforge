'use client';

import { useState, useCallback } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

interface PlateDecodeResult {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}

interface PlateInputProps {
  plate: string;
  state: string;
  onPlateChange: (plate: string) => void;
  onStateChange: (state: string) => void;
  onDecoded: (result: PlateDecodeResult) => void;
  className?: string;
}

export function PlateInput({ plate, state, onPlateChange, onStateChange, onDecoded, className }: PlateInputProps) {
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputCls = className || 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';

  const lookup = useCallback(async () => {
    const cleaned = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned || cleaned.length < 2) {
      setError('Enter a plate number');
      return;
    }
    if (!state) {
      setError('Select a state');
      return;
    }
    setLooking(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/vehicles/plate-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: cleaned, state }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Lookup failed');
        return;
      }
      onDecoded(data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Network error — could not reach lookup service');
    } finally {
      setLooking(false);
    }
  }, [plate, state, onDecoded]);

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          value={plate}
          onChange={e => { onPlateChange(e.target.value.toUpperCase()); setError(null); setSuccess(false); }}
          className={`${inputCls} flex-1 font-mono tracking-wider uppercase ${
            success ? '!border-success/50' : error ? '!border-error/50' : ''
          }`}
          placeholder="ABC1234"
          maxLength={8}
        />
        <select
          value={state}
          onChange={e => { onStateChange(e.target.value); setError(null); }}
          className={`${inputCls} w-20 text-center`}
        >
          <option value="">ST</option>
          {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          type="button"
          disabled={!plate.trim() || !state || looking}
          onClick={lookup}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-heading font-bold uppercase tracking-wider transition-all duration-150 ${
            !plate.trim() || !state || looking
              ? 'bg-card border-bdr text-slate-600 cursor-not-allowed'
              : 'bg-card border-bdr text-accent hover:border-accent/50 hover:text-orange-400'
          }`}
          title="Look up vehicle by plate"
        >
          {looking ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="hidden sm:inline">Looking up</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon d={icons.search} size={13} />
              Lookup
            </span>
          )}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Icon d={icons.alert} size={12} className="text-error shrink-0" />
          <span className="text-[11px] text-error font-body">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Icon d={icons.check} size={12} className="text-success shrink-0" />
          <span className="text-[11px] text-success font-body">Vehicle info auto-filled from plate</span>
        </div>
      )}
    </div>
  );
}
