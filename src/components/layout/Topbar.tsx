'use client';

import { usePathname } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/work-orders': 'Work Orders',
  '/scheduling': 'Scheduling',
  '/customers': 'Customers & Vehicles',
  '/invoicing': 'Invoicing & Payments',
};

export const Topbar = () => {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || PAGE_TITLES[
    Object.keys(PAGE_TITLES).find((p) => p !== '/' && pathname.startsWith(p)) || '/'
  ] || 'Dashboard';

  return (
    <header className="h-16 bg-surface border-b border-bdr flex items-center justify-between px-6 shrink-0">
      <h1 className="font-heading text-2xl font-bold text-white tracking-wide">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Icon d={icons.search} size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="bg-card border border-bdr rounded-lg pl-9 pr-4 py-2 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-accent/50 w-64 font-body"
            placeholder="Search customers, VIN, WO#..."
          />
        </div>
        <button className="relative text-slate-400 hover:text-white transition">
          <Icon d={icons.bell} size={20} />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full" />
        </button>
      </div>
    </header>
  );
};
