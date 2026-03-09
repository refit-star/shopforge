import { STATUS_COLORS } from '@/lib/types';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const c = STATUS_COLORS[status] || '#64748b';
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c + '18', color: c, border: `1px solid ${c}30` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      {status}
    </span>
  );
};
