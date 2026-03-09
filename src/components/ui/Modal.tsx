'use client';

import { type ReactNode } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: ReactNode;
}

export const Modal = ({ open, onClose, title, wide, children }: ModalProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center fadeIn" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative bg-card border border-bdr rounded-xl p-6 shadow-2xl ${wide ? 'w-[700px]' : 'w-[520px]'} max-h-[85vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading text-xl font-bold text-white tracking-wide">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition">
            <Icon d={icons.x} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
