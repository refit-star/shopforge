'use client';

import { useState, useEffect } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

interface ProvisionResult {
  shop_id: string;
  slug: string;
  user_id: string;
  login_url: string;
  twilio_phone_number: string | null;
  message: string;
}

interface HistoryEntry {
  shop_name: string;
  slug: string;
  email: string;
  date: string;
  login_url: string;
  twilio_number: string | null;
  plan: string;
}

const PLANS = [
  { id: 'starter', name: 'Starter', price: '$149/mo', desc: 'Core features + unlimited users' },
  { id: 'pro', name: 'Pro', price: '$249/mo', desc: 'Full platform + SMS, DVI, booking' },
  { id: 'own-it', name: 'Own It', price: '$3,000', desc: 'One-time purchase + source code' },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export default function AdminProvisionPage() {
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');

  // Form
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [plan, setPlan] = useState('pro');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Result
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load key from sessionStorage and history from localStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('admin-key');
      if (stored) setAdminKey(stored);
      const h = localStorage.getItem('provision-history');
      if (h) setHistory(JSON.parse(h));
    } catch {}
  }, []);

  const handleAuth = () => {
    if (!keyInput.trim()) return;
    sessionStorage.setItem('admin-key', keyInput.trim());
    setAdminKey(keyInput.trim());
    setKeyError('');
  };

  // Auto-generate slug from shop name
  useEffect(() => {
    if (!slugManual) setSlug(slugify(shopName));
  }, [shopName, slugManual]);

  const handleSubmit = async () => {
    if (!shopName.trim() || !slug.trim() || !ownerName.trim() || !ownerEmail.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/admin/provision-shop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          shop_name: shopName.trim(),
          slug: slug.trim(),
          owner_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          area_code: areaCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        // Bad admin key — clear it and show auth screen
        sessionStorage.removeItem('admin-key');
        setAdminKey('');
        setKeyError('Invalid admin key');
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Provisioning failed');
        setSubmitting(false);
        return;
      }

      setResult(data);

      // Save to history
      const entry: HistoryEntry = {
        shop_name: shopName.trim(),
        slug: slug.trim(),
        email: ownerEmail.trim(),
        date: new Date().toISOString(),
        login_url: data.login_url,
        twilio_number: data.twilio_phone_number,
        plan,
      };
      const updated = [entry, ...history].slice(0, 50);
      setHistory(updated);
      try { localStorage.setItem('provision-history', JSON.stringify(updated)); } catch {}
    } catch {
      setError('Network error — check your connection');
    }

    setSubmitting(false);
  };

  const resetForm = () => {
    setShopName('');
    setSlug('');
    setSlugManual(false);
    setOwnerName('');
    setOwnerEmail('');
    setAreaCode('');
    setPlan('pro');
    setResult(null);
    setError('');
    setCopied(false);
  };

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  // ── Auth Screen ──
  if (!adminKey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <Icon d={icons.settings} size={24} className="text-accent" />
              <span className="font-heading font-bold text-xl text-white tracking-wide">ShopForge Admin</span>
            </div>
            <p className="text-sm text-slate-500">Enter your admin key to continue</p>
          </div>

          <div className="bg-card border border-bdr rounded-xl p-6 space-y-4">
            <div>
              <label className={lbl}>Admin Key</label>
              <input
                type="password"
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAuth(); }}
                className={inp}
                placeholder="Enter key..."
                autoFocus
              />
            </div>
            {keyError && (
              <div className="text-xs text-error font-medium">{keyError}</div>
            )}
            <button
              onClick={handleAuth}
              disabled={!keyInput.trim()}
              className="w-full bg-accent text-white font-heading font-semibold text-sm uppercase tracking-wider rounded-lg py-3 hover:bg-orange-600 transition disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success Screen ──
  if (result) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-lg mx-auto pt-8">
          <div className="bg-card border border-success/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Icon d={icons.check} size={18} stroke="#22c55e" />
              </div>
              <span className="font-heading font-bold text-lg text-white tracking-wide">Shop Provisioned</span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-heading text-slate-600 uppercase tracking-wider">Shop</span>
                <div className="text-sm text-white font-medium">{shopName}</div>
              </div>
              <div>
                <span className="text-[10px] font-heading text-slate-600 uppercase tracking-wider">Plan</span>
                <div className="text-sm text-slate-300">{PLANS.find(p => p.id === plan)?.name}</div>
              </div>
              {result.twilio_phone_number && (
                <div>
                  <span className="text-[10px] font-heading text-slate-600 uppercase tracking-wider">Twilio Number</span>
                  <div className="text-sm text-slate-300">{result.twilio_phone_number}</div>
                </div>
              )}

              {/* Onboarding flow */}
              <div className="bg-surface border border-bdr rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-heading font-bold text-accent">1</span>
                  </div>
                  <div>
                    <div className="text-sm text-white font-medium">Invite email sent to {ownerEmail}</div>
                    <div className="text-xs text-slate-500 mt-0.5">They should check their inbox (and spam folder)</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-heading font-bold text-accent">2</span>
                  </div>
                  <div>
                    <div className="text-sm text-white font-medium">They click the link to set their password</div>
                    <div className="text-xs text-slate-500 mt-0.5">The link in the email takes them through password setup</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-[10px] font-heading font-bold text-accent">3</span>
                  </div>
                  <div>
                    <div className="text-sm text-white font-medium">After that, they log in at:</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <code className="text-xs text-accent bg-bg px-2 py-1.5 rounded border border-bdr flex-1 truncate">{result.login_url}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(result.login_url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className="shrink-0 bg-bg border border-bdr rounded-lg px-3 py-1.5 text-xs font-heading font-semibold uppercase tracking-wider text-slate-400 hover:text-white transition"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={resetForm}
              className="w-full bg-accent text-white font-heading font-semibold text-sm uppercase tracking-wider rounded-lg py-3 hover:bg-orange-600 transition mt-2"
            >
              Provision Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Provisioning Form ──
  return (
    <div className="min-h-screen p-6">
      <div className="max-w-lg mx-auto pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Icon d={icons.settings} size={20} className="text-accent" />
            <span className="font-heading font-bold text-lg text-white tracking-wide">Provision Shop</span>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem('admin-key'); setAdminKey(''); }}
            className="text-xs text-slate-600 hover:text-slate-400 font-heading uppercase tracking-wider transition"
          >
            Logout
          </button>
        </div>

        <div className="bg-card border border-bdr rounded-xl p-6 space-y-4">
          <div>
            <label className={lbl}>Shop Name *</label>
            <input
              value={shopName}
              onChange={e => setShopName(e.target.value)}
              className={inp}
              placeholder="Joe's Auto Repair"
            />
          </div>

          <div>
            <label className={lbl}>Slug *</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600 shrink-0">app.refit.build/login/</span>
              <input
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugManual(true); }}
                className={inp}
                placeholder="joes-auto"
              />
            </div>
            {slug && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && slug.length >= 2 && (
              <p className="text-xs text-amber-400 mt-1">Slug must be lowercase letters, numbers, and hyphens only</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Owner Name *</label>
              <input
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className={inp}
                placeholder="Joe Smith"
              />
            </div>
            <div>
              <label className={lbl}>Owner Email *</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                className={inp}
                placeholder="joe@shop.com"
              />
            </div>
          </div>

          <div>
            <label className={lbl}>Area Code (optional — auto-buy Twilio number)</label>
            <input
              value={areaCode}
              onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className={inp}
              placeholder="310"
              inputMode="numeric"
              maxLength={3}
            />
          </div>

          {/* Plan */}
          <div>
            <label className={lbl}>Plan</label>
            <div className="grid grid-cols-3 gap-2">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className={`text-left rounded-lg p-3 border transition ${
                    plan === p.id
                      ? 'border-accent bg-accent/10'
                      : 'border-bdr bg-bg hover:border-slate-600'
                  }`}
                >
                  <div className={`text-xs font-heading font-bold uppercase tracking-wider mb-0.5 ${plan === p.id ? 'text-accent' : 'text-slate-400'}`}>
                    {p.name}
                  </div>
                  <div className="text-sm font-heading font-bold text-white">{p.price}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg px-3 py-2 text-xs text-error font-medium">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !shopName.trim() || !slug.trim() || !ownerName.trim() || !ownerEmail.trim()}
            className="w-full bg-accent text-white font-heading font-semibold text-sm uppercase tracking-wider rounded-lg py-3.5 hover:bg-orange-600 transition disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Provisioning...
              </>
            ) : (
              'Provision Shop'
            )}
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="mt-8">
            <h3 className="font-heading font-bold text-sm text-slate-500 uppercase tracking-wider mb-3">
              Recent ({history.length})
            </h3>
            <div className="space-y-2">
              {history.map((h, i) => (
                <div key={i} className="bg-card border border-bdr rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white font-medium">{h.shop_name}</span>
                    <span className="text-[10px] text-slate-600">{new Date(h.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="font-mono">{h.slug}</span>
                    <span>{h.email}</span>
                    {h.twilio_number && <span>{h.twilio_number}</span>}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(h.login_url); }}
                    className="mt-1 text-[10px] text-accent hover:text-orange-400 font-heading font-bold uppercase tracking-wider"
                  >
                    Copy Login URL
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
