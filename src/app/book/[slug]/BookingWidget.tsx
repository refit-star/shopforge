'use client';

import { useState, useEffect } from 'react';

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
}

interface ShopInfo {
  name: string;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string;
  hours_start: number;
  hours_end: number;
  booking_lead_hours: number;
  booking_window_days: number;
}

type Step = 'service' | 'datetime' | 'info' | 'confirm';

export default function BookingWidget({ slug }: { slug: string }) {
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Customer info
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [vehYear, setVehYear] = useState('');
  const [vehMake, setVehMake] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [custNotes, setCustNotes] = useState('');

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    service: string;
    date: string;
    time: string;
  } | null>(null);

  // Load shop + services
  useEffect(() => {
    fetch(`/api/book/${slug}/services`)
      .then(r => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(data => {
        setShop(data.shop);
        setServices(data.services);
      })
      .catch(() => setError('Online booking is not available for this shop.'))
      .finally(() => setLoading(false));
  }, [slug]);

  // Generate date options (today + booking_window_days, skipping Sundays)
  const dateOptions = (() => {
    if (!shop) return [];
    const dates: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < shop.booking_window_days + 7 && dates.length < shop.booking_window_days; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
      // Skip Sundays (day 0)
      if (d.getUTCDay() === 0) continue;
      const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
      dates.push({ value, label });
    }
    return dates;
  })();

  // Fetch available slots when date changes
  useEffect(() => {
    if (!selectedDate || !selectedService) return;
    setSlotsLoading(true);
    setSelectedTime('');
    fetch(`/api/book/${slug}/availability?date=${selectedDate}&duration=${selectedService.duration_minutes}`)
      .then(r => r.json())
      .then(data => setAvailableSlots(data.slots || []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, selectedService, slug]);

  const formatSlotTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: custName.trim(),
          phone: custPhone.trim() || null,
          email: custEmail.trim() || null,
          service_id: selectedService!.id,
          start_time: selectedTime,
          notes: custNotes.trim() || null,
          vehicle_year: vehYear || null,
          vehicle_make: vehMake.trim() || null,
          vehicle_model: vehModel.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfirmation({ service: data.service, date: data.date, time: data.time });
        setStep('confirm');
      } else {
        const data = await res.json();
        setSubmitError(data.error || 'Failed to book appointment');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Not Available</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const inputClass = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-5 sm:px-6">
          <div className="flex items-center gap-4">
            {shop.logo_url && (
              <img src={shop.logo_url} alt={shop.name} className="h-10 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{shop.name}</h1>
              {shop.address && <p className="text-xs text-gray-500 mt-0.5">{shop.address}</p>}
            </div>
          </div>
          {(shop.phone || shop.email) && (
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              {shop.phone && <span>{shop.phone}</span>}
              {shop.email && <span>{shop.email}</span>}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 sm:px-6">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {(['service', 'datetime', 'info', 'confirm'] as Step[]).map((s, i) => {
            const labels = ['Service', 'Date & Time', 'Your Info', 'Confirmation'];
            const stepIdx = ['service', 'datetime', 'info', 'confirm'].indexOf(step);
            const active = i <= stepIdx;
            return (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${active ? 'bg-orange-500' : 'bg-gray-200'}`} />
                <p className={`text-[11px] mt-1 font-medium ${active ? 'text-orange-600' : 'text-gray-400'}`}>
                  {labels[i]}
                </p>
              </div>
            );
          })}
        </div>

        {/* Step 1: Service Selection */}
        {step === 'service' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Select a Service</h2>
            <p className="text-sm text-gray-500 mb-6">Choose the service you need.</p>

            {services.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-500 text-sm">No services are currently available for online booking.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {services.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedService(s);
                      setStep('datetime');
                    }}
                    className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 sm:p-5 transition hover:border-orange-300 hover:shadow-md ${
                      selectedService?.id === s.id ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{s.name}</div>
                        {s.description && (
                          <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 font-medium shrink-0 ml-4">
                        {s.duration_minutes >= 60
                          ? `${s.duration_minutes / 60}h`
                          : `${s.duration_minutes}m`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === 'datetime' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Pick a Date & Time</h2>
            <p className="text-sm text-gray-500 mb-6">
              {selectedService?.name} &middot; {selectedService && selectedService.duration_minutes >= 60
                ? `${selectedService.duration_minutes / 60} hour${selectedService.duration_minutes > 60 ? 's' : ''}`
                : `${selectedService?.duration_minutes} minutes`}
            </p>

            {/* Date picker */}
            <div className="mb-6">
              <label className={labelClass}>Date</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dateOptions.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDate(d.value)}
                    className={`shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium border transition ${
                      selectedDate === d.value
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div>
                <label className={labelClass}>Available Times</label>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
                    <span className="text-sm text-gray-500">Loading available times...</span>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                    <p className="text-gray-500 text-sm">No available times for this date. Try another day.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition ${
                          selectedTime === slot
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {formatSlotTime(slot)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep('service')}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={() => setStep('info')}
                disabled={!selectedTime}
                className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-lg text-sm transition"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Customer Info */}
        {step === 'info' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Your Information</h2>
            <p className="text-sm text-gray-500 mb-6">
              {selectedService?.name} &middot; {selectedDate && new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
              {selectedTime && ` at ${formatSlotTime(selectedTime)}`}
            </p>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input className={inputClass} value={custName} onChange={e => setCustName(e.target.value)} placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Phone *</label>
                  <input className={inputClass} type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="(555) 123-4567" />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input className={inputClass} type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="john@example.com" />
                </div>
              </div>

              {/* Vehicle info (optional) */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Vehicle (optional)</p>
                <div className="grid grid-cols-3 gap-3">
                  <input className={inputClass} value={vehYear} onChange={e => setVehYear(e.target.value)} placeholder="Year" />
                  <input className={inputClass} value={vehMake} onChange={e => setVehMake(e.target.value)} placeholder="Make" />
                  <input className={inputClass} value={vehModel} onChange={e => setVehModel(e.target.value)} placeholder="Model" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Notes (optional)</label>
                <textarea
                  className={inputClass + ' resize-none'}
                  rows={3}
                  value={custNotes}
                  onChange={e => setCustNotes(e.target.value)}
                  placeholder="Anything we should know?"
                />
              </div>
            </div>

            {submitError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep('datetime')}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!custName.trim() || !custPhone.trim() || submitting}
                className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-semibold rounded-lg text-sm transition"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Booking...
                  </span>
                ) : (
                  'Book Appointment'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirm' && confirmation && (
          <div className="text-center">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h2>
              <p className="text-sm text-gray-500 mb-6">
                We&apos;ve booked your appointment. You&apos;ll receive a confirmation text shortly.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 sm:p-5 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Service</span>
                  <span className="text-sm font-medium text-gray-900">{confirmation.service}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Date</span>
                  <span className="text-sm font-medium text-gray-900">{confirmation.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Time</span>
                  <span className="text-sm font-medium text-gray-900">{confirmation.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="text-sm font-medium text-gray-900">{custName}</span>
                </div>
              </div>

              <div className="mt-6 space-y-2 text-xs text-gray-400">
                <p>Please arrive 10 minutes early.</p>
                {shop.phone && <p>Questions? Call us at {shop.phone}</p>}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 text-center">
        <p className="text-xs text-gray-400">
          Powered by{' '}
          <span className="text-gray-500 font-medium">ShopForge</span>
        </p>
      </footer>
    </div>
  );
}
