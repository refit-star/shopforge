import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-server';
import BookingWidget from './BookingWidget';

export default async function BookingPage({ params }: { params: { slug: string } }) {
  const supabase = createAdminClient();
  const { data: shop } = await supabase
    .from('shops')
    .select('name, online_booking_enabled')
    .eq('slug', params.slug)
    .single();

  if (!shop || !shop.online_booking_enabled) {
    notFound();
  }

  return <BookingWidget slug={params.slug} />;
}
