'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#64748b'];

interface Props {
  initialSettings: {
    shop_name?: string;
    phone?: string;
    address?: string;
    default_labor_rate?: number;
    tax_rate?: number;
    twilio_account_sid?: string;
    stripe_secret_key?: string;
  };
}

interface TechDraft { name: string; color: string }
interface ServiceDraft { name: string; description: string }

const STEPS = [
  { label: 'Shop Info', icon: icons.settings },
  { label: 'Rates', icon: icons.dollar },
  { label: 'Technicians', icon: icons.users },
  { label: 'Services', icon: icons.wrench },
  { label: 'Integrations', icon: icons.settings },
];

export function SetupWizard({ initialSettings }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Shop Info
  const [shopName, setShopName] = useState(initialSettings.shop_name || '');
  const [shopPhone, setShopPhone] = useState(initialSettings.phone || '');
  const [shopAddress, setShopAddress] = useState(initialSettings.address || '');

  // Step 2: Rates
  const [laborRate, setLaborRate] = useState(String(initialSettings.default_labor_rate || 125));
  const [taxRate, setTaxRate] = useState(String(initialSettings.tax_rate || 0));

  // Step 3: Techs
  const [techs, setTechs] = useState<TechDraft[]>([]);
  const [techName, setTechName] = useState('');
  const [techColor, setTechColor] = useState(COLORS[0]);

  // Step 4: Services
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [serviceName, setServiceName] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');

  // Step 5: Integrations
  const [twilioSid, setTwilioSid] = useState('');
  const [twilioToken, setTwilioToken] = useState('');
  const [twilioPhone, setTwilioPhone] = useState('');
  const [stripeSecret, setStripeSecret] = useState('');
  const [stripePub, setStripePub] = useState('');

  const inp = 'bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body w-full';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  const addTech = () => {
    if (!techName.trim()) return;
    setTechs(prev => [...prev, { name: techName.trim(), color: techColor }]);
    setTechName('');
    setTechColor(COLORS[(techs.length + 1) % COLORS.length]);
  };

  const addService = () => {
    if (!serviceName.trim()) return;
    setServices(prev => [...prev, { name: serviceName.trim(), description: serviceDesc }]);
    setServiceName('');
    setServiceDesc('');
  };

  const saveAndNext = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        // Save shop info
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop_name: shopName,
            phone: shopPhone,
            address: shopAddress,
          }),
        });
      } else if (step === 1) {
        // Save rates
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            default_labor_rate: Number(laborRate) || 125,
            tax_rate: Number(taxRate) || 0,
          }),
        });
      } else if (step === 2) {
        // Create techs
        for (const t of techs) {
          await fetch('/api/techs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: t.name, color: t.color }),
          });
        }
      } else if (step === 3) {
        // Create services
        for (const s of services) {
          await fetch('/api/canned-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: s.name, description: s.description || null }),
          });
        }
      } else if (step === 4) {
        // Save integrations (if any were filled)
        const payload: Record<string, string> = {};
        if (twilioSid) payload.twilio_account_sid = twilioSid;
        if (twilioToken) payload.twilio_auth_token = twilioToken;
        if (twilioPhone) payload.twilio_phone_number = twilioPhone;
        if (stripeSecret) payload.stripe_secret_key = stripeSecret;
        if (stripePub) payload.stripe_publishable_key = stripePub;
        if (Object.keys(payload).length > 0) {
          await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
        }
      }

      if (step < 4) {
        setStep(step + 1);
      } else {
        // Final step — mark setup complete
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setup_completed_at: new Date().toISOString() }),
        });
        router.refresh();
      }
    } catch {
      // Best effort
    }
    setSaving(false);
  };

  const skip = async () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      setSaving(true);
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup_completed_at: new Date().toISOString() }),
      });
      router.refresh();
    }
  };

  const dismissWizard = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setup_completed_at: new Date().toISOString() }),
    });
    router.refresh();
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="font-heading text-3xl font-bold text-white tracking-wide mb-2">Welcome to ShopForge</h1>
        <p className="text-slate-400">Let&apos;s get your shop set up. This takes about 2 minutes.</p>
        <button onClick={dismissWizard} className="text-xs text-slate-600 hover:text-slate-400 mt-2 transition">
          Skip setup entirely
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between mb-8 px-4">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
              i < step ? 'bg-accent text-white' :
              i === step ? 'bg-accent/20 text-accent border-2 border-accent' :
              'bg-card border border-bdr text-slate-600'
            }`}>
              {i < step ? <Icon d={icons.check} size={14} /> : i + 1}
            </div>
            <span className={`text-xs font-heading font-semibold hidden sm:block ${
              i <= step ? 'text-slate-300' : 'text-slate-600'
            }`}>{s.label}</span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 sm:w-12 h-0.5 ${i < step ? 'bg-accent' : 'bg-bdr'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="bg-card border border-bdr rounded-xl p-6 mb-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-bold text-white">Shop Information</h2>
            <p className="text-sm text-slate-400">Basic info about your business.</p>
            <div>
              <label className={lbl}>Shop Name</label>
              <input value={shopName} onChange={e => setShopName(e.target.value)} className={inp} placeholder="Mike's Auto Repair" />
            </div>
            <div>
              <label className={lbl}>Phone</label>
              <input value={shopPhone} onChange={e => setShopPhone(e.target.value)} className={inp} placeholder="(555) 123-4567" />
            </div>
            <div>
              <label className={lbl}>Address</label>
              <input value={shopAddress} onChange={e => setShopAddress(e.target.value)} className={inp} placeholder="123 Main St, City, ST 12345" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-bold text-white">Rates & Tax</h2>
            <p className="text-sm text-slate-400">Set your default pricing. You can always adjust per job.</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Default Labor Rate ($/hr)</label>
                <input type="number" value={laborRate} onChange={e => setLaborRate(e.target.value)} className={inp} placeholder="125" />
              </div>
              <div>
                <label className={lbl}>Sales Tax Rate (%)</label>
                <input type="number" step="0.01" value={taxRate} onChange={e => setTaxRate(e.target.value)} className={inp} placeholder="8.25" />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-bold text-white">Add Technicians</h2>
            <p className="text-sm text-slate-400">Add the techs who work in your shop. You need at least one to assign work orders.</p>

            {/* Added techs */}
            {techs.length > 0 && (
              <div className="space-y-2">
                {techs.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 bg-bg border border-bdr rounded-lg px-3 py-2">
                    <div className="w-6 h-6 rounded-full" style={{ background: t.color }} />
                    <span className="text-sm text-white font-medium flex-1">{t.name}</span>
                    <button onClick={() => setTechs(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-error transition">
                      <Icon d={icons.x} size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add tech form */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className={lbl}>Tech Name</label>
                <input value={techName} onChange={e => setTechName(e.target.value)} className={inp}
                  placeholder="John Smith"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTech(); } }}
                />
              </div>
              <div className="flex gap-1 mb-0.5">
                {COLORS.slice(0, 5).map(c => (
                  <button key={c} onClick={() => setTechColor(c)}
                    className={`w-7 h-7 rounded-full transition ${techColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-card' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <Btn small onClick={addTech} disabled={!techName.trim()}>Add</Btn>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-bold text-white">Add Service Templates</h2>
            <p className="text-sm text-slate-400">Common jobs you do regularly. These pre-fill when creating work orders.</p>

            {/* Added services */}
            {services.length > 0 && (
              <div className="space-y-2">
                {services.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 bg-bg border border-bdr rounded-lg px-3 py-2">
                    <span className="text-sm text-white font-medium flex-1">{s.name}</span>
                    {s.description && <span className="text-xs text-slate-500">{s.description}</span>}
                    <button onClick={() => setServices(prev => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-error transition">
                      <Icon d={icons.x} size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add service form */}
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className={lbl}>Service Name</label>
                <input value={serviceName} onChange={e => setServiceName(e.target.value)} className={inp}
                  placeholder="Oil Change"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }}
                />
              </div>
              <div className="flex-1">
                <label className={lbl}>Description (optional)</label>
                <input value={serviceDesc} onChange={e => setServiceDesc(e.target.value)} className={inp} placeholder="Full synthetic oil change" />
              </div>
              <Btn small onClick={addService} disabled={!serviceName.trim()}>Add</Btn>
            </div>

            {/* Quick suggestions */}
            {services.length === 0 && (
              <div>
                <p className="text-xs text-slate-600 mb-2">Quick add common services:</p>
                <div className="flex flex-wrap gap-2">
                  {['Oil Change', 'Brake Pad Replacement', 'Tire Rotation', 'A/C Service', 'Engine Diagnostic', 'Alignment'].map(s => (
                    <button key={s} onClick={() => setServices(prev => [...prev, { name: s, description: '' }])}
                      className="text-xs bg-bg border border-bdr rounded-lg px-3 py-1.5 text-slate-400 hover:text-white hover:border-accent/50 transition">
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-bold text-white">Integrations (Optional)</h2>
            <p className="text-sm text-slate-400">Connect external services. You can always set these up later in Settings.</p>

            <div className="space-y-5">
              {/* Twilio */}
              <div className="bg-bg border border-bdr rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon d={icons.message} size={16} stroke="#3b82f6" />
                  <span className="font-heading font-bold text-sm text-white">SMS (Twilio)</span>
                  <span className="text-[10px] text-slate-600 ml-auto">For customer notifications</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input value={twilioSid} onChange={e => setTwilioSid(e.target.value)} className={inp} placeholder="Account SID" />
                  <input type="password" value={twilioToken} onChange={e => setTwilioToken(e.target.value)} className={inp} placeholder="Auth Token" />
                  <input value={twilioPhone} onChange={e => setTwilioPhone(e.target.value)} className={inp} placeholder="+1234567890" />
                </div>
              </div>

              {/* Stripe */}
              <div className="bg-bg border border-bdr rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon d={icons.dollar} size={16} stroke="#22c55e" />
                  <span className="font-heading font-bold text-sm text-white">Payments (Stripe)</span>
                  <span className="text-[10px] text-slate-600 ml-auto">For online payments</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="password" value={stripeSecret} onChange={e => setStripeSecret(e.target.value)} className={inp} placeholder="Secret Key (sk_...)" />
                  <input value={stripePub} onChange={e => setStripePub(e.target.value)} className={inp} placeholder="Publishable Key (pk_...)" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <div>
          {step > 0 && (
            <Btn variant="secondary" onClick={() => setStep(step - 1)}>Back</Btn>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={skip} className="text-sm text-slate-500 hover:text-slate-300 transition font-heading font-semibold">
            Skip {step === 4 ? '' : 'this step'}
          </button>
          <Btn onClick={saveAndNext} disabled={saving}>
            {saving ? 'Saving...' : step === 4 ? 'Finish Setup' : 'Next'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
