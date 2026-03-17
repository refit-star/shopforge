'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';
import { useTheme } from '@/components/ThemeProvider';
import dynamic from 'next/dynamic';
import { fmt } from '@/lib/utils';
import type { Tech, ShopSettings, CannedJob, Vendor, LaborLine, PartsLine } from '@/lib/types';

const ImportWizard = dynamic(() => import('@/app/(dashboard)/import/page'), { ssr: false });

const SETTINGS_TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'team', label: 'Team & Services' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'booking', label: 'Booking' },
  { key: 'import', label: 'Import / Export Data' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['key'];

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#6366f1', '#64748b'];
const HOUR_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 5); // 5 AM to 10 PM

function formatHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hr}:00 ${ampm}`;
}

export default function SettingsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SettingsPage />
    </Suspense>
  );
}

function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get('tab') as SettingsTab) || 'profile';
  const { theme, toggle: toggleTheme } = useTheme();

  // Canned Jobs
  const [cannedJobs, setCannedJobs] = useState<CannedJob[]>([]);
  const [showNewCJ, setShowNewCJ] = useState(false);
  const [cjName, setCjName] = useState('');
  const [cjDesc, setCjDesc] = useState('');
  const [cjLabor, setCjLabor] = useState<LaborLine[]>([]);
  const [cjParts, setCjParts] = useState<PartsLine[]>([]);
  const [editingCjId, setEditingCjId] = useState<string | null>(null);
  const [editCjName, setEditCjName] = useState('');
  const [editCjDesc, setEditCjDesc] = useState('');
  const [editCjLabor, setEditCjLabor] = useState<LaborLine[]>([]);
  const [editCjParts, setEditCjParts] = useState<PartsLine[]>([]);

  // Vendors
  const [vendorsList, setVendorsList] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorAcct, setNewVendorAcct] = useState('');
  const [editVendorId, setEditVendorId] = useState<string | null>(null);
  const [editVendorName, setEditVendorName] = useState('');
  const [editVendorPhone, setEditVendorPhone] = useState('');
  const [editVendorEmail, setEditVendorEmail] = useState('');
  const [editVendorAcct, setEditVendorAcct] = useState('');

  // Techs
  const [techs, setTechs] = useState<Tech[]>([]);
  const [techsLoading, setTechsLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Shop settings
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Logo upload
  const [logoUploading, setLogoUploading] = useState(false);

  // Integrations
  const [intResendKey, setIntResendKey] = useState('');
  const [intTwilioSid, setIntTwilioSid] = useState('');
  const [intTwilioToken, setIntTwilioToken] = useState('');
  const [intTwilioPhone, setIntTwilioPhone] = useState('');
  const [intStripeSecret, setIntStripeSecret] = useState('');
  const [intStripePub, setIntStripePub] = useState('');
  const [intStripeWebhook, setIntStripeWebhook] = useState('');
  const [testingStripe, setTestingStripe] = useState(false);
  const [intPtUser, setIntPtUser] = useState('');
  const [intPtKey, setIntPtKey] = useState('');
  const [testingPt, setTestingPt] = useState(false);
  const [intPlateKey, setIntPlateKey] = useState('');
  const [intDirty, setIntDirty] = useState(false);
  const [intSaving, setIntSaving] = useState(false);
  const [intSaved, setIntSaved] = useState(false);
  // Auto-SMS templates
  const AUTO_SMS_STATUSES = ['Check-In', 'In Progress', 'Waiting on Parts', 'Ready for Pickup', 'Completed'] as const;
  const [smsTemplates, setSmsTemplates] = useState<Record<string, { enabled: boolean; template: string }>>({});
  const [smsTplDirty, setSmsTplDirty] = useState(false);
  const [smsTplSaving, setSmsTplSaving] = useState(false);
  const [smsTplSaved, setSmsTplSaved] = useState(false);

  // QuickBooks
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbDisconnecting, setQbDisconnecting] = useState(false);
  const [qbStatus, setQbStatus] = useState<string | null>(null);

  const [testingResend, setTestingResend] = useState(false);
  const [testingTwilio, setTestingTwilio] = useState(false);
  const [testResult, setTestResult] = useState<{ service: string; ok: boolean; msg: string } | null>(null);
  const [twilioNumbers, setTwilioNumbers] = useState<{ number: string; label: string }[]>([]);
  const [fetchingNumbers, setFetchingNumbers] = useState(false);
  const [numbersError, setNumbersError] = useState('');

  const fetchTechs = async () => {
    const res = await fetch('/api/techs');
    const data = await res.json();
    setTechs(data);
    setTechsLoading(false);
  };

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setSettings(data);
    setSettingsLoading(false);
    // Sync integration fields
    setIntResendKey(data.resend_api_key || '');
    setIntTwilioSid(data.twilio_account_sid || '');
    setIntTwilioToken(data.twilio_auth_token || '');
    setIntTwilioPhone(data.twilio_phone_number || '');
    setIntStripeSecret(data.stripe_secret_key || '');
    setIntStripePub(data.stripe_publishable_key || '');
    setIntStripeWebhook(data.stripe_webhook_secret || '');
    setIntPtUser(data.partstech_username || '');
    setIntPtKey(data.partstech_api_key || '');
    setIntPlateKey(data.plate_lookup_api_key || '');
    setIntDirty(false);
    if (data.sms_auto_templates) {
      setSmsTemplates(data.sms_auto_templates);
    }
  };

  const fetchCannedJobs = async () => {
    const data = await fetch('/api/canned-jobs').then(r => r.json());
    setCannedJobs(data);
  };

  const fetchVendors = async () => {
    const data = await fetch('/api/vendors?active=false').then(r => r.json());
    if (Array.isArray(data)) setVendorsList(data);
    setVendorsLoading(false);
  };

  useEffect(() => {
    fetchTechs(); fetchSettings(); fetchCannedJobs(); fetchVendors();
    // Check for QB OAuth redirect
    const params = new URLSearchParams(window.location.search);
    const qb = params.get('qb');
    if (qb === 'connected') { setQbStatus('QuickBooks connected successfully!'); window.history.replaceState({}, '', '/settings'); }
    if (qb === 'error') { setQbStatus('Failed to connect QuickBooks. Please try again.'); window.history.replaceState({}, '', '/settings'); }
  }, []);

  // Tech CRUD
  const addTech = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    await fetch('/api/techs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    setNewName('');
    setNewColor(COLORS[0]);
    await fetchTechs();
    setAdding(false);
  };

  const saveTech = async (id: string) => {
    if (!editName.trim()) return;
    await fetch(`/api/techs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    });
    setEditId(null);
    await fetchTechs();
  };

  const removeTech = async (id: string) => {
    await fetch(`/api/techs/${id}`, { method: 'DELETE' });
    await fetchTechs();
  };

  const startEdit = (t: Tech) => {
    setEditId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
  };

  // Vendor CRUD
  const addVendor = async () => {
    if (!newVendorName.trim()) return;
    await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newVendorName.trim(), phone: newVendorPhone || null, email: newVendorEmail || null, account_number: newVendorAcct || null }),
    });
    setNewVendorName(''); setNewVendorPhone(''); setNewVendorEmail(''); setNewVendorAcct(''); setShowNewVendor(false);
    await fetchVendors();
  };

  const saveVendor = async (id: string) => {
    if (!editVendorName.trim()) return;
    await fetch(`/api/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editVendorName.trim(), phone: editVendorPhone || null, email: editVendorEmail || null, account_number: editVendorAcct || null }),
    });
    setEditVendorId(null);
    await fetchVendors();
  };

  const toggleVendorActive = async (v: Vendor) => {
    await fetch(`/api/vendors/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !v.active }),
    });
    await fetchVendors();
  };

  const startEditVendor = (v: Vendor) => {
    setEditVendorId(v.id);
    setEditVendorName(v.name);
    setEditVendorPhone(v.phone || '');
    setEditVendorEmail(v.email || '');
    setEditVendorAcct(v.account_number || '');
  };

  // Settings save
  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const upd = (field: keyof ShopSettings, value: string | number | boolean | null) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
    setSaved(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/logo', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.logo_url) {
        setSettings((prev) => prev ? { ...prev, logo_url: data.logo_url } : prev);
      } else {
        alert(data.error || 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleLogoRemove = async () => {
    const prev = settings?.logo_url;
    setSettings((s) => s ? { ...s, logo_url: '' as unknown as null } : s);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: '' }),
      });
      if (!res.ok) {
        alert('Failed to remove logo');
        setSettings((s) => s ? { ...s, logo_url: prev ?? null } : s);
      }
    } catch {
      alert('Failed to remove logo');
      setSettings((s) => s ? { ...s, logo_url: prev ?? null } : s);
    }
  };

  const isMasked = (v: string) => v.startsWith('\u2022\u2022\u2022\u2022');

  const saveIntegrations = async () => {
    setIntSaving(true);
    const payload: Record<string, string | null> = {};
    // Only send changed (non-masked) values
    if (!isMasked(intResendKey)) payload.resend_api_key = intResendKey || null;
    if (!isMasked(intTwilioSid)) payload.twilio_account_sid = intTwilioSid || null;
    if (!isMasked(intTwilioToken)) payload.twilio_auth_token = intTwilioToken || null;
    if (!isMasked(intTwilioPhone)) payload.twilio_phone_number = intTwilioPhone || null;
    if (!isMasked(intStripeSecret)) payload.stripe_secret_key = intStripeSecret || null;
    if (!isMasked(intStripePub)) payload.stripe_publishable_key = intStripePub || null;
    if (!isMasked(intStripeWebhook)) payload.stripe_webhook_secret = intStripeWebhook || null;
    if (intPtUser !== (settings?.partstech_username || '')) payload.partstech_username = intPtUser || null;
    if (!isMasked(intPtKey)) payload.partstech_api_key = intPtKey || null;
    if (!isMasked(intPlateKey)) payload.plate_lookup_api_key = intPlateKey || null;

    if (Object.keys(payload).length === 0) {
      setIntSaving(false);
      return;
    }

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      setIntResendKey(data.resend_api_key || '');
      setIntTwilioSid(data.twilio_account_sid || '');
      setIntTwilioToken(data.twilio_auth_token || '');
      setIntTwilioPhone(data.twilio_phone_number || '');
      setIntStripeSecret(data.stripe_secret_key || '');
      setIntStripePub(data.stripe_publishable_key || '');
      setIntStripeWebhook(data.stripe_webhook_secret || '');
      setIntPtUser(data.partstech_username || '');
      setIntPtKey(data.partstech_api_key || '');
      setIntPlateKey(data.plate_lookup_api_key || '');
      setSettings(data);
      setIntDirty(false);
      setIntSaved(true);
      setTimeout(() => setIntSaved(false), 2000);
    }
    setIntSaving(false);
  };

  const saveSmsTemplates = async () => {
    setSmsTplSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sms_auto_templates: smsTemplates }),
    });
    if (res.ok) {
      const data = await res.json();
      setSmsTemplates(data.sms_auto_templates || {});
      setSettings(data);
      setSmsTplDirty(false);
      setSmsTplSaved(true);
      setTimeout(() => setSmsTplSaved(false), 2000);
    }
    setSmsTplSaving(false);
  };

  const testIntegration = async (service: 'resend' | 'twilio') => {
    if (service === 'resend') setTestingResend(true);
    else setTestingTwilio(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ service, ok: true, msg: data.message });
      } else {
        setTestResult({ service, ok: false, msg: data.error });
      }
    } catch {
      setTestResult({ service, ok: false, msg: 'Network error' });
    } finally {
      if (service === 'resend') setTestingResend(false);
      else setTestingTwilio(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const fetchTwilioNumbers = async () => {
    setFetchingNumbers(true);
    setNumbersError('');
    try {
      const res = await fetch('/api/integrations/twilio-numbers');
      const data = await res.json();
      if (!res.ok) {
        setNumbersError(data.error || 'Failed to fetch numbers');
        return;
      }
      setTwilioNumbers(data.numbers || []);
      if (data.numbers?.length === 0) {
        setNumbersError('No phone numbers found on this Twilio account.');
      }
    } catch {
      setNumbersError('Connection failed');
    } finally {
      setFetchingNumbers(false);
    }
  };

  const inp = 'bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-white tracking-wide mb-1">Settings</h1>
          <p className="text-sm text-slate-500">Manage your shop configuration, rates, and technicians.</p>
        </div>
        {(activeTab === 'profile' || activeTab === 'booking') && (
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-success font-heading font-semibold uppercase tracking-wider">Saved</span>}
            <Btn onClick={saveSettings} disabled={saving || settingsLoading}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Btn>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-card border border-bdr rounded-xl p-1 overflow-x-auto">
        {SETTINGS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => router.push(`/settings${tab.key === 'profile' ? '' : `?tab=${tab.key}`}`)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition ${
              activeTab === tab.key
                ? 'bg-accent/15 text-accent'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'import' && (
        <>
          <ImportWizard />
          <ExportDataSection />
        </>
      )}

      {activeTab === 'profile' && (<>
      {/* Appearance */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-4">Appearance</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-heading font-semibold text-sm tracking-wider transition ${
              theme === 'light'
                ? 'bg-accent text-white'
                : 'bg-bg border border-bdr text-slate-400 hover:text-white'
            }`}
          >
            <Icon d={icons.sun} size={16} />Light
          </button>
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-heading font-semibold text-sm tracking-wider transition ${
              theme === 'dark'
                ? 'bg-accent text-white'
                : 'bg-bg border border-bdr text-slate-400 hover:text-white'
            }`}
          >
            <Icon d={icons.moon} size={16} />Dark
          </button>
        </div>
      </div>

      {settingsLoading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading settings...</div>
      ) : settings && (
        <>
          {/* Shop Logo */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-5">Shop Logo</h2>
            <div className="flex items-center gap-6">
              <div className="w-32 h-20 rounded-lg border border-bdr bg-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Shop logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-600">
                    <Icon d={icons.image} size={24} />
                    <span className="text-[10px]">No logo</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label className={lbl}>Upload Logo</label>
                <p className="text-[10px] text-slate-600 mb-2">PNG, JPG, or WebP. Max 2MB. Displayed on printed documents.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg border border-bdr text-sm text-slate-300 hover:text-white hover:border-accent/50 transition cursor-pointer">
                  <Icon d={icons.image} size={14} />
                  {logoUploading ? 'Uploading...' : 'Choose File'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={logoUploading} className="hidden" />
                </label>
                {settings.logo_url && (
                  <button
                    onClick={handleLogoRemove}
                    className="ml-3 text-xs text-slate-500 hover:text-error transition"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Shop Profile */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-5">Shop Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Shop Name</label>
                <input value={settings.shop_name} onChange={(e) => upd('shop_name', e.target.value)}
                  className={`${inp} w-full`} placeholder="Your Shop Name" />
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <input value={settings.phone} onChange={(e) => upd('phone', e.target.value)}
                  className={`${inp} w-full`} placeholder="(555) 123-4567" />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input value={settings.email} onChange={(e) => upd('email', e.target.value)}
                  className={`${inp} w-full`} placeholder="shop@example.com" />
              </div>
              <div>
                <label className={lbl}>Owner Name</label>
                <input value={settings.owner_name} onChange={(e) => upd('owner_name', e.target.value)}
                  className={`${inp} w-full`} placeholder="John Smith" />
              </div>
              <div className="col-span-2">
                <label className={lbl}>Address</label>
                <input value={settings.address} onChange={(e) => upd('address', e.target.value)}
                  className={`${inp} w-full`} placeholder="123 Main St, City, State ZIP" />
              </div>
            </div>
          </div>

          {/* Rates & Tax */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-5">Rates &amp; Tax</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Default Labor Rate ($/hr)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input type="number" step="0.01" value={settings.default_labor_rate}
                    onChange={(e) => upd('default_labor_rate', parseFloat(e.target.value) || 0)}
                    className={`${inp} w-full pl-7`} />
                </div>
                <p className="text-[10px] text-slate-600 mt-1">Pre-filled when adding labor to a work order.</p>
              </div>
              <div>
                <label className={lbl}>Sales Tax Rate (%)</label>
                <div className="relative">
                  <input type="number" step="0.01" value={Math.round(settings.tax_rate * 10000) / 100}
                    onChange={(e) => upd('tax_rate', (parseFloat(e.target.value) || 0) / 100)}
                    className={`${inp} w-full pr-7`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">Applied when generating invoices from completed work orders.</p>
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-5">Business Hours</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Opening Time</label>
                <select value={settings.hours_start} onChange={(e) => upd('hours_start', parseInt(e.target.value))}
                  className={`${inp} w-full`}>
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Closing Time</label>
                <select value={settings.hours_end} onChange={(e) => upd('hours_end', parseInt(e.target.value))}
                  className={`${inp} w-full`}>
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-600 mt-2">Controls the time range shown on the scheduling calendar.</p>
          </div>

          {/* Invoice & WO Settings */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-5">Invoices &amp; Work Orders</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={lbl}>Work Order Prefix</label>
                <input value={settings.wo_prefix} onChange={(e) => upd('wo_prefix', e.target.value)}
                  className={`${inp} w-full`} placeholder="WO" />
                <p className="text-[10px] text-slate-600 mt-1">e.g. {settings.wo_prefix}-0001</p>
              </div>
              <div>
                <label className={lbl}>Invoice Prefix</label>
                <input value={settings.invoice_prefix} onChange={(e) => upd('invoice_prefix', e.target.value)}
                  className={`${inp} w-full`} placeholder="INV" />
                <p className="text-[10px] text-slate-600 mt-1">e.g. {settings.invoice_prefix}-0001</p>
              </div>
            </div>
            <div>
              <label className={lbl}>Invoice Footer</label>
              <textarea rows={3} value={settings.invoice_footer}
                onChange={(e) => upd('invoice_footer', e.target.value)}
                className={`${inp} w-full resize-none`}
                placeholder="Thank you for your business! Warranty terms, payment info..." />
              <p className="text-[10px] text-slate-600 mt-1">Printed at the bottom of every invoice.</p>
            </div>
          </div>
        </>
      )}
      </>)}

      {activeTab === 'integrations' && (<>
      {settingsLoading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading settings...</div>
      ) : settings && (
        <>
          {/* Integrations */}
          <div className="bg-card border border-bdr rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-heading text-lg font-bold text-white tracking-wide">Integrations</h2>
              <div className="flex items-center gap-3">
                {intSaved && <span className="text-xs text-success font-heading font-semibold uppercase tracking-wider">Saved</span>}
                {intDirty && (
                  <Btn small onClick={saveIntegrations} disabled={intSaving}>
                    {intSaving ? 'Saving...' : 'Save Keys'}
                  </Btn>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-5">Enter your own API keys to enable email, SMS, and payment features.</p>

            {/* Test result banner */}
            {testResult && (
              <div className={`mb-4 rounded-lg p-3 flex items-center gap-2 text-sm font-semibold ${testResult.ok ? 'bg-success/10 border border-success/30 text-success' : 'bg-error/10 border border-error/30 text-error'}`}>
                <Icon d={testResult.ok ? icons.check : icons.alert} size={16} />
                {testResult.msg}
              </div>
            )}

            {/* Email (Resend) */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon d={icons.send} size={16} stroke="#f97316" />
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Email (Resend)</span>
                {intResendKey && intResendKey.length > 0 ? (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">Configured</span>
                ) : (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 bg-bg px-2 py-0.5 rounded">Not configured</span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className={lbl}>API Key</label>
                  <input
                    type="password"
                    value={intResendKey}
                    onChange={e => { setIntResendKey(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntResendKey(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder={intResendKey && isMasked(intResendKey) ? intResendKey : 're_...'}
                    autoComplete="off"
                  />
                </div>
                <Btn small variant="secondary" onClick={() => testIntegration('resend')} disabled={testingResend || !intResendKey || intDirty}>
                  <span className="flex items-center gap-1.5">
                    <Icon d={icons.refresh} size={12} />
                    {testingResend ? 'Testing...' : 'Test Connection'}
                  </span>
                </Btn>
              </div>
            </div>

            <div className="border-t border-bdr my-5" />

            {/* SMS (Twilio) */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <Icon d={icons.bell} size={16} stroke="#3b82f6" />
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">SMS (Twilio)</span>
                {intTwilioSid && intTwilioToken && intTwilioPhone && intTwilioSid.length > 0 ? (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">Configured</span>
                ) : (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 bg-bg px-2 py-0.5 rounded">Not configured</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Account SID</label>
                  <input
                    type="text"
                    value={intTwilioSid}
                    onChange={e => { setIntTwilioSid(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntTwilioSid(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="AC..."
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={lbl}>Auth Token</label>
                  <input
                    type="password"
                    value={intTwilioToken}
                    onChange={e => { setIntTwilioToken(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntTwilioToken(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="Auth token"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={lbl}>Twilio Phone Number</label>
                  <div className="flex gap-2">
                    {twilioNumbers.length > 0 ? (
                      <select
                        value={intTwilioPhone}
                        onChange={e => { setIntTwilioPhone(e.target.value); setIntDirty(true); }}
                        className={`${inp} w-full`}
                      >
                        <option value="">Select a number...</option>
                        {twilioNumbers.map(n => (
                          <option key={n.number} value={n.number}>
                            {n.number} {n.label !== n.number ? `(${n.label})` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={intTwilioPhone}
                        readOnly
                        className={`${inp} w-full opacity-60`}
                        placeholder="Fetch numbers →"
                      />
                    )}
                    <button
                      type="button"
                      onClick={fetchTwilioNumbers}
                      disabled={fetchingNumbers || !intTwilioSid || !intTwilioToken || intDirty}
                      className="shrink-0 bg-card border border-bdr rounded-lg px-3 py-2 text-xs font-heading font-semibold uppercase tracking-wider text-slate-400 hover:text-white hover:border-accent/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title={intDirty ? 'Save credentials first' : !intTwilioSid || !intTwilioToken ? 'Enter SID & Token first' : 'Fetch available numbers'}
                    >
                      {fetchingNumbers ? 'Loading...' : 'Fetch'}
                    </button>
                  </div>
                  {numbersError && <p className="text-xs text-red-400 mt-1">{numbersError}</p>}
                </div>
                <div className="flex items-end">
                  <Btn small variant="secondary" onClick={() => testIntegration('twilio')} disabled={testingTwilio || !intTwilioSid || !intTwilioToken || !intTwilioPhone || intDirty}>
                    <span className="flex items-center gap-1.5">
                      <Icon d={icons.refresh} size={12} />
                      {testingTwilio ? 'Testing...' : 'Test Connection'}
                    </span>
                  </Btn>
                </div>
              </div>
            </div>

            <div className="border-t border-bdr my-5" />

            {/* Payments (Stripe) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Icon d={icons.dollar} size={16} stroke="#a855f7" />
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Payments (Stripe)</span>
                {intStripeSecret && intStripeSecret.length > 0 ? (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">Configured</span>
                ) : (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 bg-bg px-2 py-0.5 rounded">Not configured</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Secret Key</label>
                  <input
                    type="password"
                    value={intStripeSecret}
                    onChange={e => { setIntStripeSecret(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntStripeSecret(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="sk_..."
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={lbl}>Publishable Key</label>
                  <input
                    type="text"
                    value={intStripePub}
                    onChange={e => { setIntStripePub(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntStripePub(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="pk_..."
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Webhook Secret</label>
                  <input
                    type="password"
                    value={intStripeWebhook}
                    onChange={e => { setIntStripeWebhook(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntStripeWebhook(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="whsec_..."
                    autoComplete="off"
                  />
                  <p className="text-[10px] text-slate-600 mt-1">From Stripe Dashboard → Developers → Webhooks. Endpoint URL: {typeof window !== 'undefined' ? window.location.origin : ''}/api/stripe/webhook</p>
                </div>
              </div>
              <div className="mt-3">
                <Btn small variant="secondary" onClick={async () => {
                  setTestingStripe(true);
                  setTestResult(null);
                  try {
                    const res = await fetch('/api/integrations/test', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ service: 'stripe' }),
                    });
                    const data = await res.json();
                    setTestResult({ service: 'stripe', ok: res.ok, msg: res.ok ? data.message : data.error });
                  } catch {
                    setTestResult({ service: 'stripe', ok: false, msg: 'Network error' });
                  }
                  setTestingStripe(false);
                  setTimeout(() => setTestResult(null), 5000);
                }} disabled={testingStripe || !intStripeSecret || intDirty}>
                  <span className="flex items-center gap-1.5">
                    <Icon d={icons.refresh} size={12} />
                    {testingStripe ? 'Testing...' : 'Test Connection'}
                  </span>
                </Btn>
              </div>
            </div>

            <div className="border-t border-bdr my-5" />

            {/* Parts Ordering (PartsTech) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Icon d={icons.box} size={16} stroke="#3b82f6" />
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Parts Ordering (PartsTech)</span>
                {intPtUser && intPtKey && intPtKey.length > 0 ? (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">Configured</span>
                ) : (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 bg-bg px-2 py-0.5 rounded">Not configured</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>PartsTech Username</label>
                  <input
                    type="text"
                    value={intPtUser}
                    onChange={e => { setIntPtUser(e.target.value); setIntDirty(true); }}
                    className={`${inp} w-full`}
                    placeholder="your-username"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={lbl}>API Key</label>
                  <input
                    type="password"
                    value={intPtKey}
                    onChange={e => { setIntPtKey(e.target.value); setIntDirty(true); }}
                    onFocus={e => { if (isMasked(e.target.value)) { setIntPtKey(''); setIntDirty(true); } }}
                    className={`${inp} w-full`}
                    placeholder="pt_..."
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="mt-3">
                <Btn small variant="secondary" onClick={async () => {
                  setTestingPt(true);
                  setTestResult(null);
                  try {
                    const res = await fetch('/api/partstech/test', { method: 'POST' });
                    const data = await res.json();
                    setTestResult({ service: 'partstech', ok: data.success, msg: data.message });
                  } catch {
                    setTestResult({ service: 'partstech', ok: false, msg: 'Network error' });
                  }
                  setTestingPt(false);
                }} disabled={testingPt || !intPtUser || !intPtKey || intDirty}>
                  {testingPt ? 'Testing...' : 'Test Connection'}
                </Btn>
                {testResult?.service === 'partstech' && (
                  <span className={`ml-3 text-xs font-heading font-bold ${testResult.ok ? 'text-success' : 'text-error'}`}>
                    {testResult.msg}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-bdr my-5" />

            {/* Plate Lookup */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Icon d={icons.search} size={16} stroke="#22c55e" />
                <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">Plate Lookup (PlateToVIN)</span>
                {intPlateKey && intPlateKey.length > 0 ? (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded">Configured</span>
                ) : (
                  <span className="ml-auto text-[10px] font-heading font-bold uppercase tracking-wider text-slate-500 bg-bg px-2 py-0.5 rounded">Using platform default</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                License plate lookup auto-fills vehicle year, make, model, and VIN. Leave blank to use the platform key, or enter your own PlateToVIN API key.
              </p>
              <div>
                <label className={lbl}>API Key (optional override)</label>
                <input
                  type="password"
                  value={intPlateKey}
                  onChange={e => { setIntPlateKey(e.target.value); setIntDirty(true); }}
                  onFocus={e => { if (isMasked(e.target.value)) { setIntPlateKey(''); setIntDirty(true); } }}
                  className={`${inp} w-full max-w-md`}
                  placeholder="Leave blank for platform default"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* QuickBooks Integration */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="mb-5">
          <h2 className="font-heading text-lg font-bold text-white tracking-wide">QuickBooks Online</h2>
          <p className="text-xs text-slate-500 mt-0.5">Sync invoices and payments to QuickBooks automatically.</p>
        </div>

        {qbStatus && (
          <div className={`mb-4 rounded-lg p-3 flex items-center gap-2 ${qbStatus.includes('success') ? 'bg-success/10 border border-success/30' : 'bg-error/10 border border-error/30'}`}>
            <Icon d={qbStatus.includes('success') ? icons.check : icons.x} size={16} stroke={qbStatus.includes('success') ? '#22c55e' : '#ef4444'} />
            <span className={`text-sm font-semibold ${qbStatus.includes('success') ? 'text-success' : 'text-error'}`}>{qbStatus}</span>
          </div>
        )}

        {settings?.qb_realm_id ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
                <Icon d={icons.check} size={16} stroke="#22c55e" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Connected</div>
                <div className="text-xs text-slate-500">Company ID: {settings.qb_realm_id}</div>
              </div>
            </div>
            <Btn
              small
              variant="danger"
              disabled={qbDisconnecting}
              onClick={async () => {
                setQbDisconnecting(true);
                try {
                  const res = await fetch('/api/quickbooks/disconnect', { method: 'POST' });
                  if (res.ok) {
                    setSettings((prev) => prev ? { ...prev, qb_realm_id: null, qb_access_token: null, qb_refresh_token: null, qb_token_expires_at: null } : prev);
                    setQbStatus('QuickBooks disconnected.');
                  }
                } finally {
                  setQbDisconnecting(false);
                }
              }}
            >
              {qbDisconnecting ? 'Disconnecting...' : 'Disconnect QuickBooks'}
            </Btn>
          </div>
        ) : (
          <Btn
            disabled={qbConnecting}
            onClick={() => {
              setQbConnecting(true);
              window.location.href = '/api/quickbooks/connect';
            }}
          >
            <span className="flex items-center gap-2">
              {qbConnecting ? 'Redirecting...' : 'Connect QuickBooks'}
            </span>
          </Btn>
        )}
      </div>
      </>)}

      {activeTab === 'notifications' && (<>
      {/* Auto-SMS Templates */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-heading text-lg font-bold text-white tracking-wide">Auto-SMS Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">Automatically text customers when a work order status changes. Requires Twilio to be configured.</p>
          </div>
          <div className="flex items-center gap-2">
            {smsTplSaved && <span className="text-xs text-success font-heading font-bold">Saved!</span>}
            <Btn small onClick={saveSmsTemplates} disabled={smsTplSaving || !smsTplDirty}>
              {smsTplSaving ? 'Saving...' : 'Save Templates'}
            </Btn>
          </div>
        </div>
        <p className="text-[10px] text-slate-600 mb-5">
          Available variables: <code className="text-slate-500">{'{{shop_name}}'}</code>, <code className="text-slate-500">{'{{vehicle}}'}</code>, <code className="text-slate-500">{'{{display_id}}'}</code>
        </p>
        <div className="space-y-3">
          {AUTO_SMS_STATUSES.map(status => {
            const tpl = smsTemplates[status] || { enabled: false, template: '' };
            return (
              <div key={status} className={`border rounded-lg p-4 transition ${tpl.enabled ? 'border-accent/30 bg-accent/5' : 'border-bdr bg-bg/50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-heading font-semibold text-white">{status}</span>
                  <button
                    onClick={() => {
                      setSmsTemplates(prev => ({
                        ...prev,
                        [status]: { ...tpl, enabled: !tpl.enabled },
                      }));
                      setSmsTplDirty(true);
                    }}
                    className={`relative w-10 h-5 rounded-full transition ${tpl.enabled ? 'bg-accent' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${tpl.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                {tpl.enabled && (
                  <textarea
                    value={tpl.template}
                    onChange={e => {
                      setSmsTemplates(prev => ({
                        ...prev,
                        [status]: { ...tpl, template: e.target.value },
                      }));
                      setSmsTplDirty(true);
                    }}
                    rows={2}
                    className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body resize-none"
                    placeholder={`Message to send when status changes to "${status}"...`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Text-to-Pay */}
        <div className="border-t border-bdr mt-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-heading font-semibold text-white">Text-to-Pay</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically text customers a payment link when an invoice is sent. Requires Twilio + Stripe.
              </p>
            </div>
            <button
              onClick={async () => {
                const newVal = !settings?.text_to_pay_enabled;
                const res = await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text_to_pay_enabled: newVal }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setSettings(data);
                }
              }}
              className={`relative w-10 h-5 rounded-full transition ${settings?.text_to_pay_enabled ? 'bg-accent' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings?.text_to_pay_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Auto-Send DVI Report */}
        <div className="border-t border-bdr mt-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-heading font-semibold text-white">Auto-Send Inspection Report</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically text the DVI report link to the customer when all inspection items are completed. Requires Twilio.
              </p>
            </div>
            <button
              onClick={async () => {
                const newVal = !settings?.dvi_auto_send;
                const res = await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dvi_auto_send: newVal }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setSettings(data);
                }
              }}
              className={`relative w-10 h-5 rounded-full transition ${settings?.dvi_auto_send ? 'bg-accent' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings?.dvi_auto_send ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Estimate Approval SMS to Shop */}
        <div className="border-t border-bdr mt-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-heading font-semibold text-white">Estimate Approval Alert</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Text your shop phone when a customer approves an estimate on the portal. Requires Twilio.
              </p>
            </div>
            <button
              onClick={() => {
                const current = smsTemplates['Estimate Approved'] || { enabled: false, template: '' };
                setSmsTemplates(prev => ({
                  ...prev,
                  ['Estimate Approved']: { ...current, enabled: !current.enabled },
                }));
                setSmsTplDirty(true);
              }}
              className={`relative w-10 h-5 rounded-full transition ${smsTemplates['Estimate Approved']?.enabled ? 'bg-accent' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${smsTemplates['Estimate Approved']?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {smsTemplates['Estimate Approved']?.enabled && (
            <textarea
              value={smsTemplates['Estimate Approved']?.template || ''}
              onChange={e => {
                setSmsTemplates(prev => ({
                  ...prev,
                  ['Estimate Approved']: { ...prev['Estimate Approved'], template: e.target.value },
                }));
                setSmsTplDirty(true);
              }}
              rows={2}
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body resize-none mt-3"
              placeholder="{{customer_name}} approved estimate {{display_id}}."
            />
          )}
        </div>

        {/* Auto-Send Estimates from DVI Approvals */}
        <div className="border-t border-bdr mt-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-heading font-semibold text-white">Auto-Send DVI Estimates</span>
              <p className="text-xs text-slate-500 mt-0.5">
                When a customer approves items on the inspection report, automatically send them the estimate for review. When off, creates a draft estimate for you to review first.
              </p>
            </div>
            <button
              onClick={async () => {
                const newVal = !(settings?.dvi_estimate_auto_send !== false);
                const res = await fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dvi_estimate_auto_send: newVal }),
                });
                if (res.ok) {
                  const data = await res.json();
                  setSettings(data);
                }
              }}
              className={`relative w-10 h-5 rounded-full transition ${settings?.dvi_estimate_auto_send !== false ? 'bg-accent' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${settings?.dvi_estimate_auto_send !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        {/* Auto-Send Service Reminders */}
        <div className="border-t border-bdr mt-5 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-heading font-semibold text-white">Service Reminder SMS</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically text customers when a service reminder comes due. Requires Twilio.
              </p>
            </div>
            <button
              onClick={() => {
                const current = smsTemplates['Service Reminder'] || { enabled: false, template: '' };
                setSmsTemplates(prev => ({
                  ...prev,
                  ['Service Reminder']: { ...current, enabled: !current.enabled },
                }));
                setSmsTplDirty(true);
              }}
              className={`relative w-10 h-5 rounded-full transition ${smsTemplates['Service Reminder']?.enabled ? 'bg-accent' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${smsTemplates['Service Reminder']?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {smsTemplates['Service Reminder']?.enabled && (
            <div className="mt-3">
              <p className="text-[10px] text-slate-600 mb-2">
                Variables: <code className="text-slate-500">{'{{shop_name}}'}</code>, <code className="text-slate-500">{'{{customer_name}}'}</code>, <code className="text-slate-500">{'{{service_type}}'}</code>, <code className="text-slate-500">{'{{due_date}}'}</code>, <code className="text-slate-500">{'{{shop_phone}}'}</code>
              </p>
              <textarea
                value={smsTemplates['Service Reminder']?.template || ''}
                onChange={e => {
                  setSmsTemplates(prev => ({
                    ...prev,
                    ['Service Reminder']: { ...prev['Service Reminder'], template: e.target.value },
                  }));
                  setSmsTplDirty(true);
                }}
                rows={2}
                className="w-full bg-bg border border-bdr rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 font-body resize-none"
                placeholder="{{shop_name}}: Reminder — your {{service_type}} service is due. Call us at {{shop_phone}} to schedule."
              />
            </div>
          )}
        </div>
      </div>
      </>)}

      {activeTab === 'booking' && (<>
      {/* Online Booking */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-white tracking-wide">Online Booking</h2>
            <p className="text-xs text-slate-500 mt-0.5">Let customers book appointments from your website.</p>
          </div>
          <button
            onClick={() => settings && upd('online_booking_enabled', !settings.online_booking_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              settings?.online_booking_enabled ? 'bg-accent' : 'bg-slate-700'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
              settings?.online_booking_enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {settings?.online_booking_enabled && (
          <div className="space-y-4">
            <div className="bg-surface border border-bdr rounded-lg p-3">
              <div className="text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1">Booking Link</div>
              <div className="text-sm text-accent font-mono break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/book/{(settings as ShopSettings & { slug?: string }).slug || 'your-shop'}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Lead Time (hours)</label>
                <select
                  value={settings?.booking_lead_hours}
                  onChange={e => upd('booking_lead_hours', Number(e.target.value))}
                  className={`${inp} w-full`}
                >
                  {[1, 2, 4, 8, 24].map(v => (
                    <option key={v} value={v}>{v}h</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Booking Window</label>
                <select
                  value={settings?.booking_window_days}
                  onChange={e => upd('booking_window_days', Number(e.target.value))}
                  className={`${inp} w-full`}
                >
                  {[7, 14, 21, 30, 60].map(v => (
                    <option key={v} value={v}>{v} days</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Mark services as &quot;Bookable&quot; in the Team &amp; Services tab to make them available online.
            </div>
          </div>
        )}
      </div>
      </>)}

      {activeTab === 'team' && (<>
      {/* Technicians */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-lg font-bold text-white tracking-wide">Technicians</h2>
          <span className="text-xs text-slate-500">{techs.length} active</span>
        </div>

        {/* Add tech form */}
        <div className="bg-bg border border-bdr rounded-lg p-4 mb-5">
          <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Add New Tech
          </label>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTech()}
                className={`${inp} w-full`} placeholder="Tech name..." />
            </div>
            <div>
              <div className="flex gap-1.5 mb-1">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className="w-5 h-5 rounded-full transition-transform"
                    style={{
                      backgroundColor: c,
                      transform: newColor === c ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: newColor === c ? `0 0 0 2px #1e293b, 0 0 0 3px ${c}` : 'none',
                    }} />
                ))}
              </div>
            </div>
            <Btn onClick={addTech} disabled={!newName.trim() || adding} small>
              <span className="flex items-center gap-1.5">
                <Icon d={icons.plus} size={12} />Add
              </span>
            </Btn>
          </div>
        </div>

        {/* Tech list */}
        {techsLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : techs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No technicians yet. Add one above.</div>
        ) : (
          <div className="space-y-1">
            {techs.map((t) => (
              <div key={t.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-surface/50 transition group">
                {editId === t.id ? (
                  <div className="flex items-center gap-3 flex-1">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveTech(t.id)}
                      className={`${inp} flex-1`} autoFocus />
                    <div className="flex gap-1">
                      {COLORS.map((c) => (
                        <button key={c} onClick={() => setEditColor(c)}
                          className="w-4 h-4 rounded-full transition-transform"
                          style={{
                            backgroundColor: c,
                            transform: editColor === c ? 'scale(1.3)' : 'scale(1)',
                            boxShadow: editColor === c ? `0 0 0 2px #1e293b, 0 0 0 3px ${c}` : 'none',
                          }} />
                      ))}
                    </div>
                    <Btn small onClick={() => saveTech(t.id)}>Save</Btn>
                    <Btn small variant="secondary" onClick={() => setEditId(null)}>Cancel</Btn>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="text-sm text-white font-medium">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEdit(t)}
                        className="p-1.5 rounded hover:bg-card text-slate-500 hover:text-white transition" title="Edit">
                        <Icon d={icons.edit} size={14} />
                      </button>
                      <button onClick={() => removeTech(t.id)}
                        className="p-1.5 rounded hover:bg-error/20 text-slate-500 hover:text-error transition" title="Remove">
                        <Icon d={icons.x} size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canned Jobs / Service Templates */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading text-lg font-bold text-white tracking-wide">Service Templates</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pre-built services for quick work order creation.</p>
          </div>
          <Btn small onClick={() => setShowNewCJ(true)}>
            <span className="flex items-center gap-1.5"><Icon d={icons.plus} size={12} />Add Template</span>
          </Btn>
        </div>

        {/* Add Template Form */}
        {showNewCJ && (
          <div className="bg-bg border border-accent/30 rounded-lg p-4 mb-4 space-y-4">
            <input value={cjName} onChange={e => setCjName(e.target.value)}
              className={`${inp} w-full`} placeholder="Service name (e.g. Oil Change)" />
            <input value={cjDesc} onChange={e => setCjDesc(e.target.value)}
              className={`${inp} w-full`} placeholder="Description (optional)" />

            {/* Labor Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={lbl}>Labor Lines</label>
                <button type="button" onClick={() => setCjLabor([...cjLabor, { description: '', hours: 1, rate: settings?.default_labor_rate ?? 125 }])}
                  className="text-[10px] font-heading font-semibold text-accent hover:text-accent/80 flex items-center gap-1">
                  <Icon d={icons.plus} size={10} />Add Labor
                </button>
              </div>
              {cjLabor.length > 0 && (
                <div className="space-y-2">
                  {cjLabor.map((ll, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_80px_28px] gap-2 items-center">
                      <input value={ll.description} onChange={e => { const u = [...cjLabor]; u[i] = { ...u[i], description: e.target.value }; setCjLabor(u); }}
                        className={`${inp} text-xs`} placeholder="Description" />
                      <input type="number" value={ll.hours} onChange={e => { const u = [...cjLabor]; u[i] = { ...u[i], hours: Number(e.target.value) }; setCjLabor(u); }}
                        className={`${inp} text-xs`} placeholder="Hours" step="0.25" min="0" />
                      <input type="number" value={ll.rate} onChange={e => { const u = [...cjLabor]; u[i] = { ...u[i], rate: Number(e.target.value) }; setCjLabor(u); }}
                        className={`${inp} text-xs`} placeholder="Rate" step="0.01" min="0" />
                      <button type="button" onClick={() => setCjLabor(cjLabor.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:bg-error/20 text-slate-500 hover:text-error transition">
                        <Icon d={icons.x} size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Parts Lines */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={lbl}>Parts Lines</label>
                <button type="button" onClick={() => setCjParts([...cjParts, { name: '', qty: 1, price: 0 }])}
                  className="text-[10px] font-heading font-semibold text-accent hover:text-accent/80 flex items-center gap-1">
                  <Icon d={icons.plus} size={10} />Add Part
                </button>
              </div>
              {cjParts.length > 0 && (
                <div className="space-y-2">
                  {cjParts.map((pl, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-center">
                      <input value={pl.name} onChange={e => { const u = [...cjParts]; u[i] = { ...u[i], name: e.target.value }; setCjParts(u); }}
                        className={`${inp} text-xs`} placeholder="Part name" />
                      <input type="number" value={pl.qty} onChange={e => { const u = [...cjParts]; u[i] = { ...u[i], qty: Number(e.target.value) }; setCjParts(u); }}
                        className={`${inp} text-xs`} placeholder="Qty" min="1" />
                      <input type="number" value={pl.price} onChange={e => { const u = [...cjParts]; u[i] = { ...u[i], price: Number(e.target.value) }; setCjParts(u); }}
                        className={`${inp} text-xs`} placeholder="Price" step="0.01" min="0" />
                      <button type="button" onClick={() => setCjParts(cjParts.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:bg-error/20 text-slate-500 hover:text-error transition">
                        <Icon d={icons.x} size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Btn small onClick={async () => {
                if (!cjName.trim()) return;
                await fetch('/api/canned-jobs', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: cjName.trim(),
                    description: cjDesc || null,
                    labor_lines: cjLabor.filter(l => l.description.trim()).map((l, i) => ({ ...l, sort_order: i })),
                    parts_lines: cjParts.filter(p => p.name.trim()).map((p, i) => ({ ...p, sort_order: i })),
                  }),
                });
                setCjName(''); setCjDesc(''); setCjLabor([]); setCjParts([]); setShowNewCJ(false); fetchCannedJobs();
              }}>Save</Btn>
              <Btn small variant="secondary" onClick={() => { setShowNewCJ(false); setCjName(''); setCjDesc(''); setCjLabor([]); setCjParts([]); }}>Cancel</Btn>
            </div>
          </div>
        )}

        {/* Canned Job List */}
        {cannedJobs.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">No service templates yet.</div>
        ) : (
          <div className="space-y-1">
            {cannedJobs.map(cj => editingCjId === cj.id ? (
              /* ---- Edit Mode ---- */
              <div key={cj.id} className="bg-bg border border-accent/30 rounded-lg p-4 space-y-4">
                <input value={editCjName} onChange={e => setEditCjName(e.target.value)}
                  className={`${inp} w-full`} placeholder="Service name" />
                <input value={editCjDesc} onChange={e => setEditCjDesc(e.target.value)}
                  className={`${inp} w-full`} placeholder="Description (optional)" />

                {/* Edit Labor Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={lbl}>Labor Lines</label>
                    <button type="button" onClick={() => setEditCjLabor([...editCjLabor, { description: '', hours: 1, rate: settings?.default_labor_rate ?? 125 }])}
                      className="text-[10px] font-heading font-semibold text-accent hover:text-accent/80 flex items-center gap-1">
                      <Icon d={icons.plus} size={10} />Add Labor
                    </button>
                  </div>
                  {editCjLabor.length > 0 && (
                    <div className="space-y-2">
                      {editCjLabor.map((ll, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_80px_28px] gap-2 items-center">
                          <input value={ll.description} onChange={e => { const u = [...editCjLabor]; u[i] = { ...u[i], description: e.target.value }; setEditCjLabor(u); }}
                            className={`${inp} text-xs`} placeholder="Description" />
                          <input type="number" value={ll.hours} onChange={e => { const u = [...editCjLabor]; u[i] = { ...u[i], hours: Number(e.target.value) }; setEditCjLabor(u); }}
                            className={`${inp} text-xs`} placeholder="Hours" step="0.25" min="0" />
                          <input type="number" value={ll.rate} onChange={e => { const u = [...editCjLabor]; u[i] = { ...u[i], rate: Number(e.target.value) }; setEditCjLabor(u); }}
                            className={`${inp} text-xs`} placeholder="Rate" step="0.01" min="0" />
                          <button type="button" onClick={() => setEditCjLabor(editCjLabor.filter((_, j) => j !== i))}
                            className="p-1 rounded hover:bg-error/20 text-slate-500 hover:text-error transition">
                            <Icon d={icons.x} size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Parts Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={lbl}>Parts Lines</label>
                    <button type="button" onClick={() => setEditCjParts([...editCjParts, { name: '', qty: 1, price: 0 }])}
                      className="text-[10px] font-heading font-semibold text-accent hover:text-accent/80 flex items-center gap-1">
                      <Icon d={icons.plus} size={10} />Add Part
                    </button>
                  </div>
                  {editCjParts.length > 0 && (
                    <div className="space-y-2">
                      {editCjParts.map((pl, i) => (
                        <div key={i} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-center">
                          <input value={pl.name} onChange={e => { const u = [...editCjParts]; u[i] = { ...u[i], name: e.target.value }; setEditCjParts(u); }}
                            className={`${inp} text-xs`} placeholder="Part name" />
                          <input type="number" value={pl.qty} onChange={e => { const u = [...editCjParts]; u[i] = { ...u[i], qty: Number(e.target.value) }; setEditCjParts(u); }}
                            className={`${inp} text-xs`} placeholder="Qty" min="1" />
                          <input type="number" value={pl.price} onChange={e => { const u = [...editCjParts]; u[i] = { ...u[i], price: Number(e.target.value) }; setEditCjParts(u); }}
                            className={`${inp} text-xs`} placeholder="Price" step="0.01" min="0" />
                          <button type="button" onClick={() => setEditCjParts(editCjParts.filter((_, j) => j !== i))}
                            className="p-1 rounded hover:bg-error/20 text-slate-500 hover:text-error transition">
                            <Icon d={icons.x} size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Btn small onClick={async () => {
                    if (!editCjName.trim()) return;
                    await fetch(`/api/canned-jobs/${cj.id}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: editCjName.trim(),
                        description: editCjDesc || null,
                        labor_lines: editCjLabor.filter(l => l.description.trim()).map((l, i) => ({ ...l, sort_order: i })),
                        parts_lines: editCjParts.filter(p => p.name.trim()).map((p, i) => ({ ...p, sort_order: i })),
                      }),
                    });
                    setEditingCjId(null); fetchCannedJobs();
                  }}>Save</Btn>
                  <Btn small variant="secondary" onClick={() => setEditingCjId(null)}>Cancel</Btn>
                </div>
              </div>
            ) : (
              /* ---- Collapsed Row ---- */
              <div key={cj.id} className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-surface/50 transition group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="text-sm text-white font-medium flex items-center gap-2 flex-wrap">
                      {cj.name}
                      {((cj.labor_lines?.length ?? 0) > 0 || (cj.parts_lines?.length ?? 0) > 0) && (
                        <span className="text-[10px] font-heading font-semibold text-slate-500 bg-surface border border-bdr rounded-full px-2 py-0.5">
                          {cj.labor_lines?.length ?? 0} labor &middot; {cj.parts_lines?.length ?? 0} parts
                        </span>
                      )}
                    </div>
                    {cj.description && <div className="text-xs text-slate-500 truncate">{cj.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      await fetch(`/api/canned-jobs/${cj.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookable: !cj.bookable }),
                      });
                      fetchCannedJobs();
                    }}
                    className={`text-[10px] font-heading font-semibold px-2 py-0.5 rounded-full border transition ${
                      cj.bookable
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-bg text-slate-600 border-bdr hover:text-slate-400'
                    }`}
                    title={cj.bookable ? 'Available for online booking' : 'Not available for online booking'}
                  >
                    {cj.bookable ? 'BOOKABLE' : 'NOT BOOKABLE'}
                  </button>
                  <button onClick={() => {
                    setEditingCjId(cj.id);
                    setEditCjName(cj.name);
                    setEditCjDesc(cj.description || '');
                    setEditCjLabor(cj.labor_lines?.length ? cj.labor_lines.map(l => ({ description: l.description, hours: l.hours, rate: l.rate, sort_order: l.sort_order })) : []);
                    setEditCjParts(cj.parts_lines?.length ? cj.parts_lines.map(p => ({ name: p.name, qty: p.qty, price: p.price, sort_order: p.sort_order })) : []);
                  }} className="p-1.5 rounded hover:bg-accent/20 text-slate-500 hover:text-accent transition opacity-0 group-hover:opacity-100"
                    title="Edit template">
                    <Icon d={icons.edit} size={14} />
                  </button>
                  <button onClick={async () => {
                    await fetch(`/api/canned-jobs/${cj.id}`, { method: 'DELETE' });
                    fetchCannedJobs();
                  }} className="p-1.5 rounded hover:bg-error/20 text-slate-500 hover:text-error transition opacity-0 group-hover:opacity-100">
                    <Icon d={icons.x} size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendors */}
      <div className="bg-card border border-bdr rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-lg font-bold text-white tracking-wide">Vendors</h2>
          <button onClick={() => setShowNewVendor(!showNewVendor)}
            className="text-accent hover:text-orange-400 text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1">
            <Icon d={icons.plus} size={12} />
            Add Vendor
          </button>
        </div>

        {showNewVendor && (
          <div className="bg-bg border border-bdr rounded-lg p-4 mb-5 space-y-3">
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider">New Vendor</label>
            <div className="grid grid-cols-2 gap-3">
              <input value={newVendorName} onChange={e => setNewVendorName(e.target.value)}
                className={`${inp} w-full`} placeholder="Vendor name *" />
              <input value={newVendorPhone} onChange={e => setNewVendorPhone(e.target.value)}
                className={`${inp} w-full`} placeholder="Phone" />
              <input value={newVendorEmail} onChange={e => setNewVendorEmail(e.target.value)}
                className={`${inp} w-full`} placeholder="Email" />
              <input value={newVendorAcct} onChange={e => setNewVendorAcct(e.target.value)}
                className={`${inp} w-full`} placeholder="Account #" />
            </div>
            <div className="flex gap-2">
              <Btn small onClick={addVendor} disabled={!newVendorName.trim()}>Add</Btn>
              <Btn small variant="secondary" onClick={() => setShowNewVendor(false)}>Cancel</Btn>
            </div>
          </div>
        )}

        {vendorsLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : vendorsList.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">No vendors yet. Add one above.</div>
        ) : (
          <div className="space-y-1">
            {vendorsList.map(v => (
              <div key={v.id} className={`flex items-center justify-between px-4 py-3 rounded-lg hover:bg-surface/50 transition group ${!v.active ? 'opacity-40' : ''}`}>
                {editVendorId === v.id ? (
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input value={editVendorName} onChange={e => setEditVendorName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveVendor(v.id)}
                        className={`${inp}`} autoFocus placeholder="Name" />
                      <input value={editVendorPhone} onChange={e => setEditVendorPhone(e.target.value)}
                        className={`${inp}`} placeholder="Phone" />
                      <input value={editVendorEmail} onChange={e => setEditVendorEmail(e.target.value)}
                        className={`${inp}`} placeholder="Email" />
                      <input value={editVendorAcct} onChange={e => setEditVendorAcct(e.target.value)}
                        className={`${inp}`} placeholder="Account #" />
                    </div>
                    <div className="flex gap-2">
                      <Btn small onClick={() => saveVendor(v.id)}>Save</Btn>
                      <Btn small variant="secondary" onClick={() => setEditVendorId(null)}>Cancel</Btn>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon d={icons.truck} size={14} stroke="#64748b" />
                        <span className="text-sm text-white font-medium">{v.name}</span>
                        {v.account_number && <span className="text-[10px] font-mono text-slate-600">({v.account_number})</span>}
                      </div>
                      <div className="text-xs text-slate-500 ml-6">
                        {[v.phone, v.email].filter(Boolean).join(' · ') || 'No contact info'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => startEditVendor(v)}
                        className="p-1.5 rounded hover:bg-card text-slate-500 hover:text-white transition" title="Edit">
                        <Icon d={icons.edit} size={14} />
                      </button>
                      <button onClick={() => toggleVendorActive(v)}
                        className={`p-1.5 rounded transition ${v.active ? 'hover:bg-error/20 text-slate-500 hover:text-error' : 'hover:bg-success/20 text-slate-500 hover:text-success'}`}
                        title={v.active ? 'Deactivate' : 'Reactivate'}>
                        <Icon d={v.active ? icons.x : icons.check} size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

// ============================================================
// EXPORT DATA SECTION
// ============================================================
function ExportDataSection() {
  const [exporting, setExporting] = useState<string | null>(null);

  const doExport = async (endpoint: string, filename: string) => {
    setExporting(endpoint);
    try {
      const res = await fetch(`/api/export/${endpoint}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const exports = [
    { key: 'customers', label: 'Export Customers', file: 'customers.csv', desc: 'Name, phone, email, address, tags' },
    { key: 'vehicles', label: 'Export Vehicles', file: 'vehicles.csv', desc: 'Customer, year, make, model, VIN, plate' },
    { key: 'parts-inventory', label: 'Export Parts Inventory', file: 'parts-inventory.csv', desc: 'Name, part number, category, qty, cost, price, vendor' },
  ];

  return (
    <div className="bg-card border border-bdr rounded-xl p-6 mt-6">
      <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-1">Export Data</h2>
      <p className="text-sm text-slate-500 mb-5">Download your shop data as CSV files.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {exports.map(e => (
          <button
            key={e.key}
            onClick={() => doExport(e.key, e.file)}
            disabled={exporting !== null}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-bdr bg-bg hover:border-accent/40 hover:bg-accent/5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon d={icons.download} size={20} stroke={exporting === e.key ? '#f97316' : '#64748b'} />
            <span className="text-sm font-heading font-semibold text-white">
              {exporting === e.key ? 'Exporting...' : e.label}
            </span>
            <span className="text-[11px] text-slate-500 leading-tight text-center">{e.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
