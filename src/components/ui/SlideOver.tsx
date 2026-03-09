'use client';

import { type ReactNode } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export const SlideOver = ({ open, onClose, title, children }: SlideOverProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[520px] bg-surface border-l border-bdr h-full overflow-y-auto slideIn shadow-2xl">
        <div className="sticky top-0 bg-surface border-b border-bdr p-4 flex items-center justify-between z-10">
          <h2 className="font-heading text-lg font-bold text-white tracking-wide">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <Icon d={icons.x} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};
