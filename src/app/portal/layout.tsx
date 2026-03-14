import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Customer Portal | ShopForge',
  description: 'View estimates and invoices',
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="portal-root" suppressHydrationWarning>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove('dark');`,
        }}
      />
      {children}
    </div>
  );
}
