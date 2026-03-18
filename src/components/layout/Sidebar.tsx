'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { supabase } from '@/lib/supabase';

interface NavItem {
  path: string;
  label: string;
  icon: readonly string[];
  matchPaths?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { path: '/', label: 'Dashboard', icon: icons.dashboard },
      { path: '/work-orders', label: 'Work Orders', icon: icons.wrench },
      { path: '/estimates', label: 'Estimates', icon: icons.clipboard },
      { path: '/scheduling', label: 'Scheduling', icon: icons.calendar },
      { path: '/time-clock', label: 'Time Clock', icon: icons.clock },
    ],
  },
  {
    label: 'Customers',
    items: [
      { path: '/customers', label: 'Customers', icon: icons.users },
      { path: '/messages', label: 'Messages', icon: icons.message },
    ],
  },
  {
    label: 'Financial',
    items: [
      { path: '/invoicing', label: 'Invoicing', icon: icons.dollar },
      { path: '/inventory', label: 'Parts', icon: icons.box, matchPaths: ['/purchase-orders'] },
      { path: '/reports', label: 'Reports', icon: icons.chart },
    ],
  },
];

const SETTINGS_ITEM: NavItem = { path: '/settings', label: 'Settings', icon: icons.settings };

const isActive = (item: NavItem, pathname: string) => {
  if (item.path === '/') return pathname === '/';
  if (pathname === item.path || pathname.startsWith(item.path)) return true;
  if (item.matchPaths) return item.matchPaths.some(p => pathname === p || pathname.startsWith(p));
  return false;
};

interface ShopBranding {
  shop_name: string;
  owner_name: string;
  owner_initials: string;
  logo_url?: string | null;
}

function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      await fetch('/api/auth/session', { method: 'DELETE' });
    } catch {
      // Best-effort
    }
    window.location.href = '/login';
  };

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      title="Sign out"
      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition disabled:opacity-50"
    >
      <Icon d={icons.logout} size={18} />
    </button>
  );
}

export const Sidebar = ({ open, onClose, shop }: { open: boolean; onClose: () => void; shop: ShopBranding | null }) => {
  const pathname = usePathname();

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-[240px] bg-surface border-r border-bdr flex flex-col shrink-0
      transform transition-transform duration-200 ease-in-out
      lg:relative lg:translate-x-0
      ${open ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="h-16 flex items-center justify-between px-5 border-b border-bdr">
        <div className="flex items-center gap-2.5">
          {shop?.logo_url ? (
            <img src={shop.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Icon d={icons.wrench} size={18} stroke="#fff" />
            </div>
          )}
          <span className="font-heading text-xl font-bold text-white tracking-wide">
            {(shop?.shop_name || 'ShopForge').toUpperCase()}
          </span>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-500 hover:text-white transition">
          <Icon d={icons.x} size={20} />
        </button>
      </div>
      <nav className="flex-1 py-2 px-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-4 pt-5 pb-1.5 first:pt-2">
              <span className="text-[10px] font-heading font-bold text-slate-600 uppercase tracking-widest">
                {group.label}
              </span>
            </div>
            <div className="space-y-1">
              {group.items.map((n) => {
                const active = isActive(n, pathname);
                return (
                  <Link
                    key={n.path}
                    href={n.path}
                    onClick={onClose}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      active
                        ? 'bg-accent/10 text-accent'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-card'
                    }`}
                    style={active ? { borderLeft: '3px solid #f97316', paddingLeft: '9px' } : {}}
                  >
                    <Icon d={n.icon} size={18} stroke={active ? '#f97316' : 'currentColor'} />
                    <span className="font-heading font-semibold tracking-wide">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <div className="mx-4 my-2 border-t border-bdr" />
        {(() => {
          const active = isActive(SETTINGS_ITEM, pathname);
          return (
            <Link
              href={SETTINGS_ITEM.path}
              onClick={onClose}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                active
                  ? 'bg-accent/10 text-accent'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-card'
              }`}
              style={active ? { borderLeft: '3px solid #f97316', paddingLeft: '9px' } : {}}
            >
              <Icon d={SETTINGS_ITEM.icon} size={18} stroke={active ? '#f97316' : 'currentColor'} />
              <span className="font-heading font-semibold tracking-wide">{SETTINGS_ITEM.label}</span>
            </Link>
          );
        })()}
      </nav>
      <div className="p-4 border-t border-bdr">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-heading font-bold text-sm">
            {shop?.owner_initials || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white">{shop?.owner_name || 'Owner'}</div>
            <div className="text-xs text-slate-500">Shop Owner</div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
};
