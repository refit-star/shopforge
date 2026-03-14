'use client';

import { useState, useCallback } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

interface VinDecodeResult {
  year?: string | null;
  make?: string | null;
  model?: string | null;
}

interface VinInputProps {
  value: string;
  onChange: (vin: string) => void;
  onDecoded: (result: VinDecodeResult) => void;
  className?: string;
  placeholder?: string;
}

export function VinInput({ value, onChange, onDecoded, className, placeholder = '17-character VIN' }: VinInputProps) {
  const [decoding, setDecoding] = useState(false);
  const [vinError, setVinError] = useState<string | null>(null);
  const [vinSuccess, setVinSuccess] = useState(false);

  const decodeVin = useCallback(async (vin: string) => {
    const cleaned = vin.trim().toUpperCase();
    if (cleaned.length !== 17) {
      setVinError('VIN must be exactly 17 characters');
      return;
    }
    setDecoding(true);
    setVinError(null);
    setVinSuccess(false);
    try {
      const res = await fetch(`/api/vin/${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok) {
        setVinError(data.error || 'Failed to decode VIN');
        return;
      }
      if (!data.year && !data.make && !data.model) {
        setVinError('No vehicle data found for this VIN');
        return;
      }
      onDecoded(data);
      setVinSuccess(true);
      setTimeout(() => setVinSuccess(false), 3000);
    } catch {
      setVinError('Network error — could not reach VIN decoder');
    } finally {
      setDecoding(false);
    }
  }, [onDecoded]);

  const handleChange = (val: string) => {
    const upper = val.toUpperCase();
    onChange(upper);
    setVinError(null);
    setVinSuccess(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim().toUpperCase();
    if (pasted.length === 17) {
      e.preventDefault();
      onChange(pasted);
      decodeVin(pasted);
    }
  };

  const inputCls = className || 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';

  return (
    <div>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={e => handleChange(e.target.value)}
            onPaste={handlePaste}
            className={`${inputCls} font-mono tracking-wider uppercase ${
              vinSuccess ? '!border-success/50' : vinError ? '!border-error/50' : ''
            }`}
            placeholder={placeholder}
            maxLength={17}
          />
          {vinSuccess && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <Icon d={icons.check} size={14} className="text-success" />
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={!value.trim() || decoding}
          onClick={() => decodeVin(value)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-heading font-bold uppercase tracking-wider transition-all duration-150 ${
            !value.trim() || decoding
              ? 'bg-card border-bdr text-slate-600 cursor-not-allowed'
              : 'bg-card border-bdr text-accent hover:border-accent/50 hover:text-orange-400'
          }`}
          title="Decode VIN"
        >
          {decoding ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="hidden sm:inline">Decoding</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icon d={icons.search} size={13} />
              Decode
            </span>
          )}
        </button>
      </div>
      {vinError && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Icon d={icons.alert} size={12} className="text-error shrink-0" />
          <span className="text-[11px] text-error font-body">{vinError}</span>
        </div>
      )}
      {vinSuccess && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <Icon d={icons.check} size={12} className="text-success shrink-0" />
          <span className="text-[11px] text-success font-body">Year, make, and model auto-filled</span>
        </div>
      )}
      {value.length > 0 && value.length < 17 && !vinError && (
        <div className="text-[10px] text-slate-600 mt-1 font-body">{value.length}/17 characters</div>
      )}
    </div>
  );
}
