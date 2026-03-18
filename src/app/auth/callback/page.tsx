'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Step = 'loading' | 'set-password' | 'success' | 'error';

export default function AuthCallbackPage() {
  const [step, setStep] = useState<Step>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('/');

  useEffect(() => {
    handleHashTokens();
  }, []);

  async function handleHashTokens() {
    // Parse tokens from URL hash (Supabase puts them there after invite/recovery redirect)
    const hash = window.location.hash.substring(1);
    if (!hash) {
      setError('No authentication tokens found. The link may have expired.');
      setStep('error');
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (!accessToken || !refreshToken) {
      setError('Invalid authentication link. Please request a new invite.');
      setStep('error');
      return;
    }

    // Set the session with the tokens from the hash
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (sessionError) {
      setError('Session expired or invalid. Please request a new invite.');
      setStep('error');
      return;
    }

    // Try to determine the shop slug for redirect
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const shopId = user?.app_metadata?.shop_id;
      if (shopId) {
        const res = await fetch(`/api/admin/shop-slug?id=${shopId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.slug) setRedirectUrl(`/login/${data.slug}`);
        }
      }
    } catch {
      // Fall back to /login — not critical
    }

    if (type === 'invite' || type === 'recovery') {
      setStep('set-password');
    } else {
      // Regular magic link or other auth — just set cookie and redirect
      await setSessionCookie(accessToken, refreshToken);
      window.location.href = '/';
    }
  }

  async function setSessionCookie(accessToken: string, refreshToken: string) {
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    });
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      // Get the current session and set the cookie
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await setSessionCookie(session.access_token, session.refresh_token);
      }

      setStep('success');

      // Auto-redirect after 2 seconds
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 2000);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  const inp = 'w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50';
  const lbl = 'block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5';

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-white tracking-wide">
            SHOPFORGE
          </h1>
        </div>

        {/* Loading */}
        {step === 'loading' && (
          <div className="bg-card border border-bdr rounded-xl p-6 text-center">
            <svg className="animate-spin h-6 w-6 mx-auto mb-3 text-accent" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-slate-400">Verifying your invite...</p>
          </div>
        )}

        {/* Set Password Form */}
        {step === 'set-password' && (
          <form onSubmit={handleSetPassword} className="bg-card border border-bdr rounded-xl p-6 space-y-4">
            <div className="text-center mb-2">
              <h2 className="font-heading text-lg font-bold text-white tracking-wide">Set Your Password</h2>
              <p className="text-xs text-slate-500 mt-1">Choose a password to access your shop dashboard</p>
            </div>

            {error && (
              <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-sm text-error">{error}</div>
            )}

            <div>
              <label className={lbl}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className={inp}
                placeholder="At least 8 characters"
                autoFocus
              />
            </div>
            <div>
              <label className={lbl}>Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className={inp}
                placeholder="Re-enter password"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-accent hover:bg-orange-600 text-white font-heading font-bold tracking-wider uppercase text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {saving ? 'Setting Password...' : 'Set Password'}
            </button>
          </form>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="bg-card border border-success/30 rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-1">Password Set</h2>
            <p className="text-sm text-slate-400">Redirecting to your dashboard...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="bg-card border border-error/30 rounded-xl p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-error/20 flex items-center justify-center mx-auto mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            <h2 className="font-heading text-lg font-bold text-white tracking-wide mb-1">Link Invalid</h2>
            <p className="text-sm text-slate-400 mb-4">{error}</p>
            <a
              href="/login"
              className="inline-block bg-accent hover:bg-orange-600 text-white font-heading font-bold tracking-wider uppercase text-sm px-6 py-2.5 rounded-lg transition"
            >
              Go to Login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
