import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProfileClient from '../service-providers/[id]/ProfileClient';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile, Service, Review } from '@/types';

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

const API_BASE = (
  process.env.SERVER_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://api.booka.co.za'
).replace(/\/+$/, '');
const apiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${normalized}` : normalized;
};

const normalizeProvider = (sp: ServiceProviderProfile): ServiceProviderProfile => {
  const id = (sp as any).id ?? (sp as any).user_id;
  const user_id = (sp as any).user_id ?? id;
  return {
    ...sp,
    id: typeof id === 'number' ? id : Number(id || 0),
    user_id: typeof user_id === 'number' ? user_id : Number(user_id || 0),
    service_categories: (sp as any).service_categories || [],
    service_price:
      (sp as any).service_price != null
        ? Number((sp as any).service_price)
        : undefined,
  } as ServiceProviderProfile;
};

async function fetchProviderOnly(raw: string): Promise<ServiceProviderProfile> {
  const isNumeric = /^\d+$/.test(raw);
  const path = isNumeric
    ? `/api/v1/service-provider-profiles/${Number(raw)}`
    : `/api/v1/service-provider-profiles/by-slug/${encodeURIComponent(raw)}`;
  const res = await fetch(apiUrl(path), {
    cache: 'force-cache',
    next: { revalidate },
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Provider fetch failed (${res.status})`);
  }
  const data = (await res.json()) as ServiceProviderProfile;
  return normalizeProvider(data);
}

type FullProviderPayload = {
  provider: ServiceProviderProfile;
  services: Service[];
  reviews: Review[];
};

async function fetchProviderFull(raw: string): Promise<FullProviderPayload> {
  const isNumeric = /^\d+$/.test(raw);
  const path = isNumeric
    ? `/api/v1/service-provider-profiles/${Number(raw)}/full`
    : `/api/v1/service-provider-profiles/by-slug/${encodeURIComponent(raw)}/full`;
  const res = await fetch(apiUrl(path), {
    cache: 'force-cache',
    next: { revalidate },
    headers: { accept: 'application/json' },
  });
  if (res.ok) {
    const payload = (await res.json()) as FullProviderPayload;
    return {
      provider: normalizeProvider(payload.provider),
      services: payload.services,
      reviews: payload.reviews,
    };
  }
  if (res.status !== 404) {
    throw new Error(`Provider full fetch failed (${res.status})`);
  }
  // Backend not yet updated with /full endpoints; fall back to the legacy trio.
  const provider = await fetchProviderOnly(raw);
  const providerId =
    (provider as any).user_id ??
    (typeof (provider as any).id === 'number' ? (provider as any).id : 0) ??
    0;
  const [services, reviews] = await Promise.all([
    fetchServices(providerId),
    fetchReviews(providerId),
  ]);
  return { provider, services, reviews };
}

async function fetchServices(providerId: number): Promise<Service[]> {
  const res = await fetch(
    apiUrl(`/api/v1/services/artist/${providerId}`),
    {
      cache: 'force-cache',
      next: { revalidate },
      headers: { accept: 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Services fetch failed (${res.status})`);
  return (await res.json()) as Service[];
}

async function fetchReviews(providerId: number): Promise<Review[]> {
  const res = await fetch(
    apiUrl(`/api/v1/reviews/service-provider-profiles/${providerId}/reviews`),
    {
      cache: 'force-cache',
      next: { revalidate },
      headers: { accept: 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Reviews fetch failed (${res.status})`);
  return (await res.json()) as Review[];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const raw = params.providerSlug;
  if (RESERVED_PROVIDER_SLUGS.has(raw)) {
    return { title: 'Service Provider' };
  }

  try {
    const sp = await fetchProviderOnly(raw);
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
    const full = await fetchProviderFull(raw);
    const providerId =
      (full.provider as any).user_id ??
      (typeof full.provider.id === 'number' ? full.provider.id : 0) ??
      0;

    return (
      <ProfileClient
        serviceProviderId={providerId}
        initialServiceProvider={full.provider}
        initialServices={full.services}
        initialReviews={full.reviews}
      />
    );
  } catch {
    notFound();
  }
}
