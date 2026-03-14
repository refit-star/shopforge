import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-server';
import LoginForm from './LoginForm';

export default async function ShopLoginPage({ params }: { params: { slug: string } }) {
  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from('shops')
    .select('name, logo_url')
    .eq('slug', params.slug)
    .single();

  if (!shop) {
    notFound();
  }

  return <LoginForm shop={shop} />;
}
