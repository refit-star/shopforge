import { type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  className?: string;
}

interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  className?: string;
}

export const TH = ({ children, className = '', ...rest }: THProps) => (
  <th
    className={`px-4 py-3 text-left text-[11px] font-heading font-semibold text-slate-500 uppercase tracking-[0.12em] ${className}`}
    {...rest}
  >
    {children}
  </th>
);

export const TD = ({ children, className = '', ...rest }: TDProps) => (
  <td className={`px-4 py-3 text-sm ${className}`} {...rest}>
    {children}
  </td>
);
