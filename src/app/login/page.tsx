'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { shopConfig } from '@/lib/config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      if (data.session) {
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        document.cookie = `sb-refresh-token=${data.session.refresh_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        window.location.href = '/';
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <h1 className="font-heading text-3xl font-bold text-white tracking-wide">
            {shopConfig.name.toUpperCase()}
          </h1>
          <p className="text-slate-500 text-sm mt-1">{shopConfig.tagline}</p>
        </div>
        <form onSubmit={handleLogin} className="bg-card border border-bdr rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-sm text-error">{error}</div>
          )}
          <div>
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50" />
          </div>
          <div>
            <label className="block text-xs font-heading font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full bg-bg border border-bdr rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-accent hover:bg-orange-600 text-white font-heading font-bold tracking-wider uppercase text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
