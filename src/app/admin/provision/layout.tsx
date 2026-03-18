import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'ShopForge Admin',
  description: 'Shop provisioning dashboard',
  appleWebApp: {
    capable: true,
    title: 'ShopForge Admin',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0d1117',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-white">
      {children}
    </div>
  );
}
