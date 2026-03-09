import { type Priority, PRIORITY_COLORS } from '@/lib/types';

interface PriorityBarProps {
  priority: Priority;
}

export const PriorityBar = ({ priority }: PriorityBarProps) => {
  const c = PRIORITY_COLORS[priority];
  return <div className="w-1 rounded-full absolute left-0 top-0 bottom-0" style={{ background: c }} />;
};
