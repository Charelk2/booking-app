import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProfileClient from '../service-providers/[id]/ProfileClient';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
} from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';

export const revalidate = 60;

type Params = { params: { providerSlug: string } };

const RESERVED_PROVIDER_SLUGS = new Set([
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const raw = params.providerSlug;
  if (RESERVED_PROVIDER_SLUGS.has(raw)) {
    return { title: 'Service Provider' };
  }

  try {
    const { data: sp } = await getServiceProvider(/^\d+$/.test(raw) ? Number(raw) : raw);
    const displayName =
      sp.business_name ||
      `${sp.user?.first_name ?? ''} ${sp.user?.last_name ?? ''}`.trim() ||
      'Service Provider';
    const image = sp.profile_picture_url
      ? getFullImageUrl(sp.profile_picture_url)
      : undefined;
    const description = sp.description || undefined;
    const slug = sp.slug || String(sp.user_id);
    const canonical = `https://booka.co.za/${encodeURIComponent(slug)}`;

    return {
      title: displayName,
      description,
      alternates: {
        canonical,
      },
      openGraph: {
        title: displayName,
        description,
        url: canonical,
        images: image ? [image] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: displayName,
        description,
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: 'Service Provider' };
  }
}

export default async function ProviderSlugPage({ params }: Params) {
  const raw = params.providerSlug;

  // Let dedicated routes handle their own paths; this dynamic route is for
  // provider slugs only.
  if (RESERVED_PROVIDER_SLUGS.has(raw)) {
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
