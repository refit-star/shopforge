export const shopConfig = {
  name: process.env.NEXT_PUBLIC_SHOP_NAME || 'ShopForge',
  tagline: process.env.NEXT_PUBLIC_SHOP_TAGLINE || 'Mechanic Shop Management',
  ownerName: process.env.NEXT_PUBLIC_SHOP_OWNER_NAME || 'Shop Owner',
  ownerInitials: process.env.NEXT_PUBLIC_SHOP_OWNER_INITIALS || 'SO',
  phone: process.env.NEXT_PUBLIC_SHOP_PHONE || '',
  address: process.env.NEXT_PUBLIC_SHOP_ADDRESS || '',
  laborRate: Number(process.env.NEXT_PUBLIC_SHOP_LABOR_RATE || 120),
  taxRate: Number(process.env.NEXT_PUBLIC_SHOP_TAX_RATE || 0.08),
  hoursStart: Number(process.env.NEXT_PUBLIC_SHOP_HOURS_START || 8),
  hoursEnd: Number(process.env.NEXT_PUBLIC_SHOP_HOURS_END || 18),
  accentColor: process.env.NEXT_PUBLIC_SHOP_ACCENT_COLOR || '#f97316',
} as const;
