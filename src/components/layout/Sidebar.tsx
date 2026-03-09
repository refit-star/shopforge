'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, icons } from '@/components/ui/Icon';
import { shopConfig } from '@/lib/config';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: icons.dashboard },
  { path: '/work-orders', label: 'Work Orders', icon: icons.wrench },
  { path: '/scheduling', label: 'Scheduling', icon: icons.calendar },
  { path: '/customers', label: 'Customers', icon: icons.users },
  { path: '/invoicing', label: 'Invoicing', icon: icons.dollar },
];

export const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="w-[240px] h-screen bg-surface border-r border-bdr flex flex-col shrink-0">
      <div className="h-16 flex items-center px-5 border-b border-bdr">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Icon d={icons.wrench} size={18} stroke="#fff" />
          </div>
          <span className="font-heading text-xl font-bold text-white tracking-wide">
            {shopConfig.name.toUpperCase()}
          </span>
        </div>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map((n) => {
          const active = pathname === n.path || (n.path !== '/' && pathname.startsWith(n.path));
          return (
            <Link
              key={n.path}
              href={n.path}
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
      </nav>
      <div className="p-4 border-t border-bdr">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-heading font-bold text-sm">
            {shopConfig.ownerInitials}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{shopConfig.ownerName}</div>
            <div className="text-xs text-slate-500">Shop Owner</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
