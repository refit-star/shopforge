export const icons = {
  dashboard: ['M3 3h7v7H3V3z', 'M14 3h7v7h-7V3z', 'M3 14h7v7H3v-7z', 'M14 14h7v7h-7v-7z'],
  wrench: ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z'],
  calendar: ['M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
  users: ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M23 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
  dollar: ['M12 1v22', 'M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H7'],
  search: ['M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z'],
  bell: ['M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 01-3.46 0'],
  plus: ['M12 5v14m-7-7h14'],
  x: ['M18 6L6 18M6 6l12 12'],
  clock: ['M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z', 'M12 6v6l4 2'],
  truck: ['M1 3h15v13H1V3z', 'M16 8h4l3 3v5h-7V8z', 'M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  alert: ['M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  chevDown: ['M6 9l6 6 6-6'],
  check: ['M20 6L9 17l-5-5'],
  file: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
} as const;

export type IconName = keyof typeof icons;

interface IconProps {
  d: string | readonly string[];
  size?: number;
  stroke?: string;
  fill?: string;
  className?: string;
}

export const Icon = ({ d, size = 20, stroke = 'currentColor', fill = 'none', className = '' }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {Array.isArray(d)
      ? d.map((p, i) => <path key={i} d={p} />)
      : <path d={d as string} />}
  </svg>
);
