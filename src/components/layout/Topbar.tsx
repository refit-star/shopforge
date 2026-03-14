'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/work-orders': 'Work Orders',
  '/scheduling': 'Scheduling',
  '/customers': 'Customers & Vehicles',
  '/invoicing': 'Invoicing & Payments',
  '/estimates': 'Estimates',
  '/inventory': 'Parts',
  '/purchase-orders': 'Parts',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

interface SearchResult {
  type: string;
  id: string;
  display_id?: string;
  label: string;
  subtitle: string;
  customer_id?: string;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const RESULT_GROUPS: Record<string, string> = {
  customer: 'Customers',
  vehicle: 'Vehicles',
  work_order: 'Work Orders',
  invoice: 'Invoices',
  estimate: 'Estimates',
  purchase_order: 'Purchase Orders',
};

const GROUP_ORDER = ['customer', 'vehicle', 'work_order', 'invoice', 'estimate', 'purchase_order'];

function getResultHref(result: SearchResult): string {
  switch (result.type) {
    case 'customer':
      return `/customers?open=${result.id}`;
    case 'vehicle':
      return `/customers?open=${result.customer_id}`;
    case 'work_order':
      return `/work-orders?open=${result.id}`;
    case 'invoice':
      return `/invoicing?open=${result.id}`;
    case 'estimate':
      return `/estimates?open=${result.id}`;
    case 'purchase_order':
      return `/purchase-orders?open=${result.id}`;
    default:
      return '/';
  }
}

function getNotificationHref(n: { type: string; work_order_id?: string | null; appointment_id?: string | null; customer_id?: string | null }): string | null {
  switch (n.type) {
    case 'estimate_approved':
      return '/estimates';
    case 'online_booking':
      return '/scheduling';
    case 'dvi_approved':
      return n.work_order_id ? `/work-orders?open=${n.work_order_id}` : '/work-orders';
    case 'status_change':
      return n.work_order_id ? `/work-orders?open=${n.work_order_id}` : '/work-orders';
    default:
      return null;
  }
}

export const Topbar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  const pathname = usePathname();
  const router = useRouter();
  const title = PAGE_TITLES[pathname] || PAGE_TITLES[
    Object.keys(PAGE_TITLES).find((p) => p !== '/' && pathname.startsWith(p)) || '/'
  ] || 'Dashboard';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: string;
    message: string;
    created_at: string;
    read_at: string | null;
    work_order_id?: string | null;
    appointment_id?: string | null;
    customer_id?: string | null;
    customer?: { id: string; name: string } | null;
  }>>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const handleChange = useCallback((value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length < 2) {
      setResults([]);
      setShowResults(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setShowResults(true);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  // Click result
  const handleResultClick = useCallback((result: SearchResult) => {
    const href = getResultHref(result);
    setQuery('');
    setResults([]);
    setShowResults(false);
    router.push(href);
  }, [router]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data || []);
      }
    } catch {}
  }, []);

  // Poll notifications every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Mark all notifications as read
  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id);
    if (unreadIds.length === 0) return;
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch {}
  }, [notifications]);

  // Click a notification: navigate + mark as read
  const handleNotifClick = useCallback(async (n: typeof notifications[number]) => {
    const href = getNotificationHref(n);
    if (!n.read_at) {
      try {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [n.id] }),
        });
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      } catch {}
    }
    if (href) {
      setShowNotifs(false);
      router.push(href);
    }
  }, [notifications, router]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowResults(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Close dropdown on navigation
  useEffect(() => {
    setShowResults(false);
    setShowNotifs(false);
    setQuery('');
    setResults([]);
  }, [pathname]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Group results by type
  const grouped = GROUP_ORDER
    .map((type) => ({
      type,
      label: RESULT_GROUPS[type] || type,
      items: results.filter((r) => r.type === type),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <header className="h-14 md:h-16 bg-surface border-b border-bdr flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden text-slate-400 hover:text-white transition p-1">
          <Icon d={['M4 6h16', 'M4 12h16', 'M4 18h16']} size={22} />
        </button>
        <h1 className="font-heading text-lg md:text-2xl font-bold text-white tracking-wide">{title}</h1>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <div className="relative hidden md:block" ref={containerRef}>
          <Icon d={icons.search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => { if (results.length > 0) setShowResults(true); }}
            className="bg-card border border-bdr rounded-lg pl-9 pr-14 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 w-64 font-body"
            placeholder="Search customers, VIN, WO#..."
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 bg-surface border border-bdr rounded px-1.5 py-0.5 font-mono pointer-events-none">
            ⌘K
          </kbd>

          {showResults && (grouped.length > 0 || loading) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-bdr rounded-xl shadow-xl max-h-80 overflow-y-auto z-50">
              {loading && grouped.length === 0 && (
                <div className="px-3 py-4 text-sm text-slate-500 text-center">Searching...</div>
              )}
              {grouped.map((group) => (
                <div key={group.type}>
                  <div className="px-3 pt-3 pb-1 text-[10px] font-heading font-semibold text-slate-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  {group.items.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full text-left px-3 py-2 hover:bg-surface/50 cursor-pointer text-sm text-slate-300 flex flex-col gap-0.5 transition-colors"
                    >
                      <span className="font-medium">
                        {result.display_id ? (
                          <>
                            <span className="text-accent mr-1.5">{result.display_id}</span>
                            {result.label !== result.display_id && result.label}
                          </>
                        ) : (
                          result.label
                        )}
                      </span>
                      {result.subtitle && (
                        <span className="text-xs text-slate-500">{result.subtitle}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
              {!loading && grouped.length === 0 && query.length >= 2 && (
                <div className="px-3 py-4 text-sm text-slate-500 text-center">No results found</div>
              )}
            </div>
          )}
        </div>
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifs(!showNotifs);
              if (!showNotifs) fetchNotifications();
            }}
            className="relative text-slate-400 hover:text-white transition"
          >
            <Icon d={icons.bell} size={20} />
            {notifications.filter(n => !n.read_at).length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-accent rounded-full flex items-center justify-center">
                <span className="text-[10px] font-bold text-white leading-none">
                  {notifications.filter(n => !n.read_at).length > 9 ? '9+' : notifications.filter(n => !n.read_at).length}
                </span>
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-card border border-bdr rounded-xl shadow-xl max-h-96 overflow-y-auto z-50">
              <div className="px-3 py-2 border-b border-bdr flex items-center justify-between">
                <span className="text-xs font-heading font-semibold text-white uppercase tracking-wider">Notifications</span>
                {notifications.some(n => !n.read_at) && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] font-heading font-semibold text-accent hover:text-accent/80 transition"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-3 py-6 text-sm text-slate-500 text-center">No notifications yet</div>
              ) : (
                <div>
                  {notifications.map(n => {
                    const href = getNotificationHref(n);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`w-full text-left px-3 py-2.5 border-b border-bdr/50 last:border-0 transition ${!n.read_at ? 'bg-accent/5' : ''} ${href ? 'hover:bg-surface/50 cursor-pointer' : ''}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read_at && <span className="w-2 h-2 bg-accent rounded-full mt-1.5 shrink-0" />}
                          <div className={`flex-1 ${n.read_at ? 'ml-4' : ''}`}>
                            <p className="text-sm text-slate-300 leading-snug">{n.message}</p>
                            <p className="text-[10px] text-slate-600 mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
