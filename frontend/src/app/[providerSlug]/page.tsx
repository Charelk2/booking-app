import { notFound } from 'next/navigation';
import ProfileClient from '../service-providers/[id]/ProfileClient';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
} from '@/lib/api';

export const revalidate = 60;

type Params = { params: { providerSlug: string } };

export default async function ProviderSlugPage({ params }: Params) {
  const raw = params.providerSlug;

  // Let dedicated routes handle their own paths; this dynamic route is for
  // provider slugs only.
  const reserved = new Set([
    'api',
    'auth',
    'dashboard',
    'service-providers',
    'category',
    'inbox',
    'faq',
    'support',
    'account',
    'contact',
    'privacy',
    'terms',
    'services',
    'booking',
    'booking-requests',
    'login',
    'register',
    'forgot-password',
    'reset-password',
    'calendar-sync',
    'magic',
    'security',
  ]);
  if (reserved.has(raw)) {
    notFound();
  }

  try {
    const spRes = await getServiceProvider(/^\d+$/.test(raw) ? Number(raw) : raw);
    const providerId = (spRes.data.user_id ?? (/^\d+$/.test(raw) ? Number(raw) : 0)) || 0;

    const [svcsRes, revsRes] = await Promise.all([
      getServiceProviderServices(providerId),
      getServiceProviderReviews(providerId),
    ]);

    return (
      <ProfileClient
        serviceProviderId={providerId}
        initialServiceProvider={spRes.data}
        initialServices={svcsRes.data}
        initialReviews={revsRes.data}
      />
    );
  } catch {
    notFound();
  }
}

