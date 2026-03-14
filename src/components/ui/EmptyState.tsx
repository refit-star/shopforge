import { Icon, icons, type IconName } from '@/components/ui/Icon';
import { Btn } from '@/components/ui/Btn';

interface EmptyStateProps {
  icon: string | readonly string[];
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <div className="w-16 h-16 rounded-2xl bg-surface border border-bdr flex items-center justify-center mb-4">
      <Icon d={icon} size={28} stroke="#475569" />
    </div>
    <h3 className="font-heading font-bold text-lg text-white mb-1">{title}</h3>
    <p className="text-sm text-slate-500 text-center max-w-sm mb-4">{description}</p>
    {action && (
      <Btn onClick={action.onClick}>
        <span className="flex items-center gap-2">
          <Icon d={icons.plus} size={14} />
          {action.label}
        </span>
      </Btn>
    )}
  </div>
);
