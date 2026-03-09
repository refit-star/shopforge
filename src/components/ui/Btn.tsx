import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type BtnVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: BtnVariant;
  small?: boolean;
}

const variantStyles: Record<BtnVariant, string> = {
  primary: 'bg-accent hover:bg-orange-600 text-white',
  secondary: 'bg-card hover:bg-bdr text-slate-300 border border-bdr',
  success: 'bg-success/20 hover:bg-success/30 text-success border border-success/30',
  danger: 'bg-error/20 hover:bg-error/30 text-error border border-error/30',
  ghost: 'hover:bg-card text-slate-400 hover:text-white',
};

export const Btn = ({ children, variant = 'primary', className = '', small, ...rest }: BtnProps) => {
  const base = `font-heading font-bold tracking-wider uppercase transition-all duration-150 rounded-lg ${small ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'}`;
  return (
    <button className={`${base} ${variantStyles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
};
