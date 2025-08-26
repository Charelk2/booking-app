'use client';

import React, { useEffect, useMemo, useState, useDeferredValue, startTransition } from 'react';
import Head from 'next/head';
// next/image is wrapped via SafeImage to ensure reliable fallback
import SafeImage from '@/components/ui/SafeImage';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';

import MainLayout from '@/components/layout/MainLayout';
import { BookingProvider } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Toast, Spinner, SkeletonList } from '@/components/ui';

import type { ServiceProviderProfile, Service, Review as ReviewType } from '@/types';
import {
  getServiceProvider,
  getServiceProviderServices,
  getServiceProviderReviews,
  createBookingRequest,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
  XMarkIcon,
  ShareIcon,
  HeartIcon,
  BoltIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  ChatBubbleOvalLeftIcon,
  LinkIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';

import { getFullImageUrl, normalizeService, getTownProvinceFromAddress } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────────────────
   Lazy heavy UI: booking flows
   ────────────────────────────────────────────────────────────────────────── */
const BookingWizard = dynamic(() => import('@/components/booking/BookingWizard'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
      <Spinner size="lg" />
    </div>
  ),
});

const BookinWizardPersonilsedVideo = dynamic(
  () => import('@/components/booking/bookinwizardpersonilsedvideo'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
        <Spinner size="lg" />
      </div>
    ),
  }
);

/* ────────────────────────────────────────────────────────────────────────────
   Demo: fallback reviews
   ────────────────────────────────────────────────────────────────────────── */
const FAKE_REVIEWS: ReviewType[] = [
  {
    id: -1,
    booking_id: 0,
    rating: 5,
    comment: 'Absolutely amazing performance! Professional and punctual — highly recommended.',
    created_at: '2025-07-12T10:30:00.000Z',
    updated_at: '2025-07-12T10:30:00.000Z',
    client: { id: 901, email: 'lerato@example.com', user_type: 'client', first_name: 'Lerato', last_name: 'M.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -2,
    booking_id: 0,
    rating: 4,
    comment: 'Great set and vibes. Sound was on point.',
    created_at: '2025-07-05T18:00:00.000Z',
    updated_at: '2025-07-05T18:00:00.000Z',
    client: { id: 902, email: 'thabo@example.com', user_type: 'client', first_name: 'Thabo', last_name: 'K.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -3,
    booking_id: 0,
    rating: 5,
    comment: 'They kept the dance floor busy all night. Will book again!',
    created_at: '2025-06-28T21:15:00.000Z',
    updated_at: '2025-06-28T21:15:00.000Z',
    client: { id: 903, email: 'amina@example.com', user_type: 'client', first_name: 'Amina', last_name: 'S.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -4,
    booking_id: 0,
    rating: 5,
    comment: 'Super friendly and easy to coordinate with. 10/10.',
    created_at: '2025-06-15T14:05:00.000Z',
    updated_at: '2025-06-15T14:05:00.000Z',
    client: { id: 904, email: 'nandi@example.com', user_type: 'client', first_name: 'Nandi', last_name: 'P.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -5,
    booking_id: 0,
    rating: 4,
    comment: 'Great energy and solid playlist. Crowd loved it!',
    created_at: '2025-06-01T19:45:00.000Z',
    updated_at: '2025-06-01T19:45:00.000Z',
    client: { id: 905, email: 'michael@example.com', user_type: 'client', first_name: 'Michael', last_name: 'J.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -6,
    booking_id: 0,
    rating: 5,
    comment: 'Professional from start to finish. Soundcheck was quick and clean.',
    created_at: '2025-05-24T16:20:00.000Z',
    updated_at: '2025-05-24T16:20:00.000Z',
    client: { id: 906, email: 'zanele@example.com', user_type: 'client', first_name: 'Zanele', last_name: 'R.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -7,
    booking_id: 0,
    rating: 5,
    comment: 'Exceeded expectations — our guests are still talking about it!',
    created_at: '2025-05-10T20:10:00.000Z',
    updated_at: '2025-05-10T20:10:00.000Z',
    client: { id: 907, email: 'liam@example.com', user_type: 'client', first_name: 'Liam', last_name: 'N.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -8,
    booking_id: 0,
    rating: 4,
    comment: 'Good communication and setup. Would recommend.',
    created_at: '2025-04-27T12:00:00.000Z',
    updated_at: '2025-04-27T12:00:00.000Z',
    client: { id: 908, email: 'karen@example.com', user_type: 'client', first_name: 'Karen', last_name: 'D.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -9,
    booking_id: 0,
    rating: 5,
    comment: 'Fantastic selection and smooth transitions. Super talented.',
    created_at: '2025-04-08T22:30:00.000Z',
    updated_at: '2025-04-08T22:30:00.000Z',
    client: { id: 909, email: 'sibongile@example.com', user_type: 'client', first_name: 'Sibongile', last_name: 'T.', phone_number: '', is_active: true, is_verified: true },
  },
  {
    id: -10,
    booking_id: 0,
    rating: 5,
    comment: 'Booked for a corporate event — flawless execution and great feedback.',
    created_at: '2025-03-30T09:00:00.000Z',
    updated_at: '2025-03-30T09:00:00.000Z',
    client: { id: 910, email: 'pieter@example.com', user_type: 'client', first_name: 'Pieter', last_name: 'V.', phone_number: '', is_active: true, is_verified: true },
  },
];

/* ────────────────────────────────────────────────────────────────────────────
   Utils (pure)
   ────────────────────────────────────────────────────────────────────────── */
function formatZAR(val?: number | string | null) {
  const num = typeof val === 'string' ? parseFloat(val) : val ?? NaN;
  if (!Number.isFinite(num)) return 'Price not available';
  return Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(num as number);
}
function getServicePrice(s: Service) {
  return (s as any).base_price ?? (s as any).price ?? (s as any).cost ?? null;
}
function getServiceImage(s: Service) {
  const raw =
    (s as any).media_url ??
    (s as any).image_url ??
    (s as any).cover_image_url ??
    (s as any).photo_url ??
    (s as any).image ??
    null;
  return raw ? getFullImageUrl(raw) : null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Small presentational bits
   ────────────────────────────────────────────────────────────────────────── */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700 shadow-sm">
      <CheckBadgeIcon className="h-4 w-4" />
      {children}
    </span>
  );
}

function ReviewStars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <StarIcon key={i} className={`h-5 w-5 ${i < full ? 'text-yellow-400' : 'text-gray-300'}`} />
      ))}
    </div>
  );
}

function ReviewSummary({ reviews }: { reviews: ReviewType[] }) {
  const total = reviews.length;
  const avg = useMemo(() => {
    if (!total) return null;
    const n = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / total;
    return n.toFixed(1);
  }, [reviews, total]);

  const breakdown = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) counts[Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)))] += 1;
    return [5, 4, 3, 2, 1].map((k) => ({
      stars: k,
      count: counts[k],
      pct: total ? Math.round((counts[k] / total) * 100) : 0,
    }));
  }, [reviews, total]);

  if (!total) return null;
  return (
    <div className="rounded-2xl border border-gray-100 p-4 shadow-sm bg-gradient-to-br from-white to-gray-50">
      <div className="flex items-center gap-3">
        <StarIcon className="h-6 w-6 text-yellow-400" />
        <p className="text-lg font-semibold text-gray-900">
          {avg} · {total} {total === 1 ? 'review' : 'reviews'}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {breakdown.map((row) => (
          <div key={`row-${row.stars}`} className="flex items-center gap-3">
            <span className="w-8 text-sm text-gray-600">{row.stars}★</span>
            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-gray-900" style={{ width: `${row.pct}%` }} />
            </div>
            <span className="w-10 text-right text-sm text-gray-600">{row.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */
export default function ServiceProviderProfilePage() {
  // Keep hook order stable forever
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useAuth(); // keep user context warm (no UI assumptions)

  const serviceProviderId = Number(id);

  // Data state
  const [serviceProvider, setServiceProvider] = useState<ServiceProviderProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<ReviewType[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Booking
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [selectedVideoService, setSelectedVideoService] = useState<Service | null>(null);

  // Modals & sheets
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAllReviewsOpen, setIsAllReviewsOpen] = useState(false);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailedService, setDetailedService] = useState<Service | null>(null);

  // Review controls (search + sort)
  const [reviewSort, setReviewSort] = useState<'recent' | 'highest' | 'lowest'>('recent');
  const [reviewQuery, setReviewQuery] = useState('');
  const reviewQueryDeferred = useDeferredValue(reviewQuery);

  /* ───────────── Fetch profile */
  useEffect(() => {
    if (!serviceProviderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getServiceProvider(serviceProviderId);
        if (!cancelled) setServiceProvider(res.data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Failed to load service provider profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceProviderId]);

  /* ───────────── Fetch services */
  useEffect(() => {
    if (!serviceProviderId) return;
    let cancelled = false;
    setServicesLoading(true);
    getServiceProviderServices(serviceProviderId)
      .then((res) => {
        if (cancelled) return;
        setServices(res.data.map(normalizeService));
      })
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setServicesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [serviceProviderId]);

  /* ───────────── Fetch reviews */
  useEffect(() => {
    if (!serviceProviderId) return;
    let cancelled = false;
    setReviewsLoading(true);
    getServiceProviderReviews(serviceProviderId)
      .then((res) => {
        if (!cancelled) setReviews(res.data);
      })
      .catch((err) => console.error(err))
      .finally(() => !cancelled && setReviewsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [serviceProviderId]);

  /* ───────────── Derived values (memoized, stable) */
  const displayReviews = useMemo<ReviewType[]>(() => {
    // If there are fewer than 10 fetched reviews, pad with fake ones for demo
    const real = Array.isArray(reviews) ? reviews : [];
    if (real.length >= 10) return real;
    const needed = 10 - real.length;
    return real.concat(FAKE_REVIEWS.slice(0, Math.max(0, needed)));
  }, [reviews]);

  const averageRating = useMemo(() => {
    if (!displayReviews.length) return null;
    const n = displayReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / displayReviews.length;
    return n.toFixed(2);
  }, [displayReviews]);

  const filteredSortedReviews = useMemo(() => {
    let arr = [...displayReviews];
    const q = reviewQueryDeferred.trim().toLowerCase();
    if (q) arr = arr.filter((r) => (r.comment || '').toLowerCase().includes(q));
    if (reviewSort === 'recent') {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (reviewSort === 'highest') {
      arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      arr.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }
    return arr;
  }, [displayReviews, reviewQueryDeferred, reviewSort]);

  const priceBand = useMemo(() => {
    if (!services.length) return null;
    const prices = services.map((s) => Number(getServicePrice(s))).filter((n) => Number.isFinite(n));
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatZAR(min) : `${formatZAR(min)} – ${formatZAR(max)}`;
  }, [services]);

  const highlights: string[] = useMemo(() => {
    const out: string[] = [];
    const sp: any = serviceProvider;
    if (!sp) return out;
    if (sp.location) out.push(getTownProvinceFromAddress(sp.location));
    if (sp.custom_subtitle) out.push(sp.custom_subtitle);
    if (Array.isArray(sp.specialties) && sp.specialties.length) out.push(...sp.specialties.slice(0, 3));
    if (sp.owns_pa) out.push('Owns PA');
    if (sp.insured) out.push('Insured');
    if (Array.isArray(sp.languages) && sp.languages.length) out.push(...sp.languages.slice(0, 2));
    if (typeof sp.avg_response_minutes === 'number') {
      out.push(sp.avg_response_minutes <= 60 ? '< 1h response' : `~ ${Math.round(sp.avg_response_minutes / 60)}h response`);
    }
    if ((sp.bookings_count || 0) > 0) out.push(`${sp.bookings_count}+ bookings`);
    if (sp.verified) out.push('Verified');
    return out;
  }, [serviceProvider]);

  const galleryImages = useMemo(() => {
    const urls: string[] = [];
    const sp: any = serviceProvider;
    if (!sp) return urls;
    const toImageUrl = (u: string) => getFullImageUrl(u);
    if (Array.isArray(sp.portfolio_image_urls)) urls.push(...(sp.portfolio_image_urls.map(toImageUrl) as string[]));
    if (Array.isArray(sp.portfolio_urls)) urls.push(...(sp.portfolio_urls.map(toImageUrl) as string[]));
    const defaultAvatar = getFullImageUrl('/static/default-avatar.svg');
    const imageExt = /\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|$)/i;
    const filtered = urls.filter((u) => u && u !== defaultAvatar && imageExt.test(u));
    // de-dup
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const u of filtered) if (!seen.has(u)) { seen.add(u); deduped.push(u); }
    return deduped;
  }, [serviceProvider]);

  if (loading) {
    return (
      <MainLayout hideFooter>
        <div className="min-h-[70vh] grid place-items-center px-4">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error || !serviceProvider) {
    return (
      <MainLayout hideFooter>
        <div className="text-center py-16 px-6" role="alert">
          <h2 className="text-xl font-semibold text-gray-800">{error || 'Service Provider not found'}</h2>
        </div>
      </MainLayout>
    );
  }

  /* ───────────── Safe values after guards */
  const coverPhotoUrl = getFullImageUrl(serviceProvider.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(serviceProvider.profile_picture_url);
  const displayName =
    serviceProvider.business_name ||
    `${serviceProvider.user.first_name} ${serviceProvider.user.last_name}`;
  const formattedLocation = serviceProvider.location ? getTownProvinceFromAddress(serviceProvider.location) : '';
  const selectedServiceObj = selectedServiceId ? services.find((s) => s.id === selectedServiceId) ?? null : null;

  /* ───────────── Handlers */
  async function handleBookService(service: Service) {
    const type = (service as any).service_type;
    if (type === 'Live Performance' || type === 'Virtual Appearance') {
      startTransition(() => {
        setSelectedService(service);
        setIsBookingOpen(true);
      });
      return;
    }
    if (type === 'Personalized Video') {
      startTransition(() => {
        setSelectedVideoService(service);
        setIsVideoOpen(true);
      });
      return;
    }
    try {
      const res = await createBookingRequest({
        artist_id: serviceProviderId,
        service_id: service.id,
        service_provider_id: 0,
      });
      router.push(`/booking-requests/${res.data.id}`);
    } catch (err) {
      console.error('Failed to create request', err);
      Toast.error('Failed to create request');
    }
  }

  function openMobileServicePicker(prefillId?: number) {
    if (!services.length) return;
    startTransition(() => {
      setSelectedServiceId(prefillId ?? null);
      setIsServicePickerOpen(true);
    });
  }

  /* ───────────── UI */
  return (
    <>
      <Head>
        <title>{displayName}</title>
        <meta property="og:title" content={displayName} />
        {serviceProvider.description && <meta property="og:description" content={serviceProvider.description} />}
        {profilePictureUrl && <meta property="og:image" content={profilePictureUrl} />}
      </Head>

      <MainLayout hideFooter>
        <div className="bg-white">
          {/* ======================== MOBILE ======================== */}
          <section className="md:hidden">
            {/* Hero */}
            <div className="relative h-48 w-full overflow-hidden">
              {coverPhotoUrl ? (
                <SafeImage src={coverPhotoUrl} alt="Cover photo" fill priority className="object-cover" sizes="100vw" />
              ) : (
                <div className="h-full w-full bg-gray-100" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  className="rounded-full bg-white/90 p-1.5 shadow-sm"
                  aria-label="Share profile"
                  onClick={() => setIsShareOpen(true)}
                >
                  <ShareIcon className="h-4 w-4 text-gray-700" />
                </button>
                <button className="rounded-full bg-white/90 p-1.5 shadow-sm" aria-label="Save profile">
                  <HeartIcon className="h-4 w-4 text-gray-700" />
                </button>
              </div>
            </div>

            {/* Card */}
            <div className="-mt-10 px-4">
              <div className="relative bg-white/90 rounded-2xl shadow-sm border border-gray-100 p-4 backdrop-blur">
                <div className="flex items-center gap-4">
                  <div className="relative -mt-10 h-20 w-20 shrink-0 rounded-full ring-4 ring-white overflow-hidden bg-gray-200">
                    {profilePictureUrl ? (
                      <SafeImage src={profilePictureUrl} alt={displayName} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="h-full w-full grid place-items-center">
                        <UserIcon className="h-10 w-10 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 truncate">{displayName}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      {formattedLocation && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 border border-gray-200">
                          <MapPinIcon className="h-4 w-4" />
                          {formattedLocation}
                        </span>
                      )}
                      {averageRating && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 border border-amber-100 text-amber-700"
                          onClick={() => setIsAllReviewsOpen(true)}
                          role="button"
                        >
                          <StarIcon className="h-4 w-4" />
                          {averageRating} ({displayReviews.length})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {serviceProvider.description && (
                  <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{serviceProvider.description}</p>
                )}

                {!!highlights.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {highlights.slice(0, 6).map((h) => (
                      <Pill key={h}>{h}</Pill>
                    ))}
                  </div>
                )}

                {priceBand && (
                  <p className="mt-3 text-sm text-gray-900">
                    <span className="font-semibold">Typical price:</span> {priceBand}
                  </p>
                )}
              </div>
            </div>

            <div className="mx-auto max-w-5xl px-4 mt-6 space-y-8">
              <section id="services" aria-labelledby="services-heading" className="mb-16">
                <h2 id="services-heading" className="text-lg font-bold text-gray-900">
                  Services
                </h2>
                <div className="mt-4">
                  {servicesLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : services.length ? (
                    <ul className="space-y-3">
                      {services.map((s) => {
                        const img = getServiceImage(s);
                        const duration =
                          (s as any).duration ||
                          (s as any)?.details?.duration_label ||
                          ((s as any).duration_minutes ? `${(s as any).duration_minutes} min` : null);
                        const priceText = formatZAR(getServicePrice(s));
                        return (
                          <li key={`svc-mobile-${s.id}`}>
                            <button
                              onClick={() => {
                                setDetailedService(s);
                                setIsDetailsOpen(true);
                              }}
                              className="group w-full rounded-xl border border-gray-100 p-3 shadow-sm hover:border-gray-200 active:scale-[0.99] transition"
                              aria-label={`View ${s.title || (s as any).service_type}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                  {img ? (
                                    <SafeImage src={img} alt="" fill className="object-cover" sizes="64px" />
                                  ) : (
                                    <div className="h-full w-full bg-gray-100" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold text-left text-gray-900 truncate">
                                    {s.title || (s as any).service_type}
                                  </p>
                                  <p className="mt-1 text-xs text-left text-gray-600">
                                    {[ (s as any).service_type, duration, priceText ].filter(Boolean).join(' · ')}
                                  </p>
                                  {s.description && (
                                    <p className="mt-1 text-sm text-left text-gray-600 line-clamp-2">{s.description}</p>
                                  )}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-gray-600">This service provider currently has no services listed.</p>
                  )}
                </div>
              </section>

              {/* Message helper before reviews (mobile) */}
              <div className="mt-16">
                <p className="text-xs text-gray-400">
                  You can message {displayName} to customize or make changes.
                </p>
                <div className="mt-4 mb-10 h-px w-full bg-gray-200" />
              </div>

              <section id="reviews" aria-labelledby="reviews-heading">
                <h2 id="reviews-heading" className="text-lg font-bold text-gray-900">
                  Reviews ({displayReviews.length})
                </h2>
                <div className="mt-4 space-y-4">
                  <ReviewSummary reviews={displayReviews} />
                  {reviewsLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : displayReviews.length ? (
                    <>
                      <ul className="space-y-4">
                        {displayReviews.map((review) => (
                          <li key={`review-mobile-${review.id}`} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-start justify-between gap-3">
                              <ReviewStars rating={Number(review.rating) || 0} />
                              {review.client?.first_name && (
                                <p className="text-sm font-medium text-gray-700 shrink-0">{review.client.first_name}</p>
                              )}
                            </div>
                            {review.comment && (
                              <p className="mt-2 text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                            )}
                            <p className="mt-2 text-xs text-gray-400">
                              Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {displayReviews.length > 6 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            className="w-full inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                            onClick={() => setIsAllReviewsOpen(true)}
                          >
                            Show all
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-600">No reviews yet for this service provider.</p>
                  )}
                </div>
              </section>
              {!!galleryImages.length && (
                <>
                  <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                  <section id="portfolio" aria-labelledby="portfolio-heading">
                    <h2 id="portfolio-heading" className="text-lg font-bold text-gray-900">
                      My Portfolio
                    </h2>
                    <ul className="mt-3 grid grid-cols-3 gap-1">
                      {galleryImages.slice(0, 6).map((src, i) => (
                        <li
                          key={`portfolio-mobile-${i}`}
                          className="relative aspect-square overflow-hidden rounded-lg border border-gray-100"
                        >
                          <SafeImage src={src} alt="" fill className="object-cover" sizes="50vw" />
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

<section aria-label="Vetted by Booka" className="mt-16">
  <div className="relative isolate overflow-hidden rounded-3xl border border-amber-100 bg-white p-6 text-center shadow-sm md:p-10 dark:border-gray-800 dark:bg-gray-900">
    {/* soft background glow */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-300/40 blur-3xl dark:bg-amber-400/10"
    />

    <div className="mx-auto flex max-w-3xl flex-col items-center">
      {/* Gold B badge */}
      <div
        role="img"
        aria-label="Booka vetted badge"
        className="relative h-28 w-28 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500 shadow-lg ring-1 ring-amber-300/60 md:h-32 md:w-32 dark:from-amber-500 dark:via-amber-600 dark:to-amber-700"
      >
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-100 to-amber-300 ring-1 ring-inset ring-amber-200/70 dark:from-amber-200 dark:to-amber-400" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl font-black tracking-tight text-amber-900/80 drop-shadow-sm md:text-5xl dark:text-amber-950">
          B
        </span>
      </div>

      {/* Copy centered under badge */}
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl dark:text-white">
        {displayName} is vetted by Booka
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
        Booka evaluates every service provider’s professional experience, portfolio, and verified client
        feedback to ensure consistent quality.
      </p>

      <a
        href="/trust-and-safety"
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        Learn how we vet
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>
  </div>
</section>



              {(serviceProvider as any)?.cancellation_policy && (
                <section aria-labelledby="policies-heading">
                  <h2 id="policies-heading" className="text-lg font-bold text-gray-900">
                    Policies
                  </h2>
                  <div className="mt-3 rounded-2xl border border-gray-100 p-4 text-sm text-gray-700 whitespace-pre-line bg-white">
                    {(serviceProvider as any).cancellation_policy}
                  </div>
                </section>
              )}
            </div>

            {/* Mobile Sticky CTA */}
            {!!services.length && (
              <div className="md:hidden sticky bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/80 supports-[backdrop-filter]:bg-white/60 backdrop-blur px-4 py-3">
                <div className="mx-auto max-w-5xl">
                  <button
                    onClick={() => openMobileServicePicker()}
                    className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-semibold bg-gray-900 text-white shadow-sm active:scale-[0.99] transition disabled:opacity-50"
                    disabled={!services.length}
                    aria-label="Request booking"
                  >
                    Request booking
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ======================== DESKTOP ======================== */}
          <section className="hidden md:block">
            <div className="mx-auto max-w-6xl md:flex bg-white">
              {/* Left rail (sticky) */}
              <aside className="md:w-2/5 md:flex md:flex-col bg-white p-6 md:sticky md:self-start md:border-gray-100" style={{ top: '5.5rem' }}>
                <div className="relative h-48 overflow-hidden rounded-3xl shadow-sm" role="img" aria-label="Cover photo">
                  {coverPhotoUrl ? (
                    <SafeImage src={coverPhotoUrl} alt="Cover photo" fill priority className="object-cover rounded-3xl" sizes="40vw" />
                  ) : (
                    <div className="h-full grid place-items-center text-gray-500">No cover photo</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent rounded-3xl" />
                  <div className="absolute right-3 top-3 flex gap-1.5">
                    <button className="rounded-full bg-white/90 p-1.5 shadow-sm" aria-label="Share profile" onClick={() => setIsShareOpen(true)}>
                      <ShareIcon className="h-4 w-4 text-gray-700" />
                    </button>
                    <button className="rounded-full bg-white/90 p-1.5 shadow-sm" aria-label="Save profile">
                      <HeartIcon className="h-4 w-4 text-gray-700" />
                    </button>
                  </div>
                </div>

                <div className="pt-0 bg-white">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative -mt-12">
                      {profilePictureUrl ? (
                        <SafeImage
                          src={profilePictureUrl}
                          width={96}
                          height={96}
                          className="h-24 w-24 rounded-full object-cover shadow-md ring-4 ring-white"
                          alt={displayName}
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-gray-300 grid place-items-center text-gray-500 shadow-md ring-4 ring-white">
                          <UserIcon className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h1 className="mt-4 text-4xl font-bold text-gray-900">{displayName}</h1>

                    {serviceProvider.description && (
                      <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{serviceProvider.description}</p>
                    )}

                    {!!highlights.length && (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {highlights.slice(0, 8).map((h) => (
                          <Pill key={h}>{h}</Pill>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500">
                      {formattedLocation && !serviceProvider.custom_subtitle && (
                        <span className="flex items-center">
                          <MapPinIcon className="h-3 w-3 mr-1" /> {formattedLocation}
                        </span>
                      )}
                      {averageRating && (
                        <span className="flex items-center cursor-pointer" onClick={() => setIsAllReviewsOpen(true)}>
                          <StarSolidIcon className="h-3 w-3 mr-1 text-yellow-400" /> {averageRating} ({displayReviews.length} reviews)
                        </span>
                      )}
                      {priceBand && (
                        <span className="flex items-center">
                          <BoltIcon className="h-3 w-3 mr-1" /> {priceBand}
                        </span>
                      )}
                    </div>
                  </div>

                  {(serviceProvider as any)?.cancellation_policy && (
                    <section className="mt-6" aria-labelledby="policies-heading-desktop">
                      <h2 id="policies-heading-desktop" className="text-lg font-bold text-gray-900">
                        Policies
                      </h2>
                      <div className="mt-3 rounded-2xl border border-gray-100 p-4 text-sm text-gray-700 whitespace-pre-line">
                        {(serviceProvider as any).cancellation_policy}
                      </div>
                    </section>
                  )}
                </div>
              </aside>

              {/* Right rail */}
              <section className="md:w-3/5 p-6 space-y-4">
                {!!services.length && (
                  <div className="sticky md: hidden top-20 z-10 mt-1 mb-1 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border border-gray-100 rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                    <div className="text-md text-gray-700">
                      {priceBand ? (
                        <>
                          <span className="font-semibold">Typical price:</span> {priceBand}
                        </>
                      ) : (
                        'Select a service to see pricing'
                      )}
                    </div>
                    <button
                      onClick={() => openMobileServicePicker()}
                      className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold bg-gray-900 text-white shadow-sm hover:bg-gray-800"
                    >
                      Request booking
                    </button>
                  </div>
                )} 

                <section id="services-desktop" aria-labelledby="services-heading-desktop" className="pb-10">
                  {servicesLoading ? (
                    <SkeletonList className="max-w-md" />
                  ) : services.length ? (
                    <ul className="space-y-6">
                      {services.map((service) => {
                        const img = getServiceImage(service);
                        const duration =
                          (service as any).duration ||
                          (service as any)?.details?.duration_label ||
                          ((service as any).duration_minutes ? `${(service as any).duration_minutes} min` : null);
                        const priceText = formatZAR(getServicePrice(service));
                        return (
                          <li key={`service-desktop-${service.id}`}>
                            <div
                              className="group cursor-pointer rounded-xl bg-white hover:border-gray-300 transition"
                              onClick={() => {
                                setDetailedService(service);
                                setIsDetailsOpen(true);
                              }}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && (setDetailedService(service), setIsDetailsOpen(true))}
                              aria-label={`View details for ${service.title || (service as any).service_type}`}
                            >
                              <div className="flex gap-4 h-full">
                                <div className="relative h-32 w-32 rounded-3xl overflow-hidden bg-gray-100 shrink-0 group-hover:scale-105 transition-transform duration-200">
                                  {img ? (
                                    <SafeImage src={img} alt={service.title || (service as any).service_type} fill className="object-cover" sizes="128px" />
                                  ) : (
                                    <div className="h-full w-full grid place-items-center text-gray-400">No image</div>
                                  )}
                                </div>
                                <div className="flex-1 flex flex-col justify-between">
                                  <div>
                                    <h3 className="text-md font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                                      {service.title || (service as any).service_type}
                                    </h3>
                                    <p className="text-sm text-gray-900">
                                    {[ (service as any).service_type, duration, priceText ].filter(Boolean).join(' · ')}
                                    </p>
                                    {service.description && (
                                      <p className="mt-2 text-sm text-gray-500 line-clamp-3">{service.description}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-gray-600">This service provider currently has no services listed.</p>
                  )}
                </section>

                {/* Message helper before reviews (desktop) */}
                <div className="mt-16">
                  <p className="text-xs text-gray-400">
                    You can message {displayName} to customize or make changes.
                  </p>
                  <div className="mt-10 mb-10 h-px w-full bg-gray-200" />
                </div>

                <section id="reviews-desktop" aria-labelledby="reviews-heading-desktop">
                  <h2 id="reviews-heading-desktop" className="text-2xl font-bold text-gray-800 mb-6">
                    Reviews
                  </h2>
                  <div className="space-y-6 mb-10">
                    <ReviewSummary reviews={displayReviews} />
                    {reviewsLoading ? (
                      <SkeletonList className="max-w-md" />
                    ) : displayReviews.length ? (
                      <>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {displayReviews.slice(0, 6).map((review) => (
                            <li key={`review-desktop-${review.id}`} className="bg-white p-5 rounded-xl transition-shadow duration-200">
                              <div className="flex items-start justify-between mb-3">
                                <ReviewStars rating={Number(review.rating) || 0} />
                                {review.client?.first_name && (
                                  <p className="text-sm font-medium text-gray-700 ml-3">{review.client.first_name}</p>
                                )}
                              </div>
                              <p className="text-gray-600 text-xs leading-relaxed">{review.comment}</p>
                              <p className="mt-2 text-xs text-gray-400">
                                Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {displayReviews.length > 6 && (
                          <div className="mt-2">
                            <button
                              type="button"
                              className="w-full inline-flex items-center justify-center rounded-xl bg-gray-100 px-4 py-3.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition"
                              onClick={() => setIsAllReviewsOpen(true)}
                            >
                              Show all reviews
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-600">No reviews yet for this service provider.</p>
                    )}
                  </div>
                </section>

                {!!galleryImages.length && (
                  <>
                    <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                    <section
                      id="portfolio-desktop"
                      aria-labelledby="portfolio-heading-desktop"
                    >
                      <h2
                        id="portfolio-heading-desktop"
                        className="text-2xl font-bold text-gray-800 mb-6 mt-10"
                      >
                        My Portfolio
                      </h2>
                      <ul className="grid grid-cols-4 gap-2">
                        {galleryImages.slice(0, 9).map((src, i) => (
                          <li
                            key={`portfolio-desktop-${i}`}
                            className="relative aspect-square overflow-hidden rounded-lg border border-gray-100"
                          >
                            <SafeImage src={src} alt="" fill className="object-cover" sizes="33vw" />
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}

<section aria-label="Vetted by Booka" className="mt-16 pt-16">
  <div className="relative isolate overflow-hidden rounded-3xl bg-gray-100 p-6 shadow-sm md:p-10 dark:border-gray-800 dark:bg-gray-900">
    {/* soft background glow */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full  blur-3xl dark:bg-amber-400/10"
    />
    <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-6">
      {/* Image (from /public) */}
      <div className="flex justify-center mb-4">
        <img
          src="/booka-vetted.jpg" /* ← update this path to your file in /public */
          alt="Booka vetted"
          className="h-24 w-24 md:h-32 md:w-32 rounded-2xl object-contain"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Copy */}
      <div className="text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
          {displayName} is vetted by Booka
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          Booka evaluates every service provider’s professional experience, portfolio, and verified client
          feedback to ensure consistent quality.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <a
            href="/trust-and-safety"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            Learn how we vet
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <span className="hidden text-sm text-gray-400 md:inline">•</span>
          <span className="hidden text-sm text-gray-500 md:inline dark:text-gray-400">
            Backed by verified reviews
          </span>
        </div>
      </div>
    </div>
  </div>
</section>


              </section>
            </div>
          </section>
        </div>
      </MainLayout>

      {/* Booking modal */}
      {isBookingOpen && selectedService && (
        <BookingProvider>
          <BookingWizard
            artistId={serviceProviderId}
            serviceId={selectedService?.id}
            isOpen={isBookingOpen}
            onClose={() => {
              setIsBookingOpen(false);
              setSelectedService(null);
            }}
          />
        </BookingProvider>
      )}

      {/* Personalized Video sheet */}
      {isVideoOpen && (
        <BookinWizardPersonilsedVideo
          artistId={serviceProviderId}
          isOpen={isVideoOpen}
          onClose={() => setIsVideoOpen(false)}
          basePriceZar={Number(getServicePrice(selectedVideoService || ({} as Service)) || 0) || 0}
          serviceId={selectedVideoService?.id}
        />
      )}

      {/* Service Picker Sheet (mobile) */}
      {isServicePickerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Choose a service to book">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsServicePickerOpen(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
              <div className="mx-auto max-w-5xl flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">Select a service</h3>
                <button onClick={() => setIsServicePickerOpen(false)} className="p-2 rounded-lg hover:bg-gray-50" aria-label="Close">
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3">
              {selectedServiceObj && (
                <div className="mb-4 overflow-hidden rounded-xl border border-gray-100">
                  <div className="relative h-40 w-full bg-gray-100">
                    {(() => {
                      const img = getServiceImage(selectedServiceObj);
                      return img ? <SafeImage src={img} alt="" fill className="object-cover" sizes="100vw" /> : <div className="h-full w-full bg-gray-100" />;
                    })()}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{selectedServiceObj.title || (selectedServiceObj as any).service_type}</p>
                          <p className="text-white/80 text-xs">
                            {(selectedServiceObj as any).service_type}
                            {(selectedServiceObj as any).duration ||
                            (selectedServiceObj as any)?.details?.duration_label ||
                            (selectedServiceObj as any).duration_minutes
                              ? ` • ${
                                  (selectedServiceObj as any).duration ??
                                  (selectedServiceObj as any)?.details?.duration_label ??
                                  `${(selectedServiceObj as any).duration_minutes} min`
                                }`
                              : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-white text-sm font-semibold">{formatZAR(getServicePrice(selectedServiceObj))}</div>
                      </div>
                    </div>
                  </div>
                  {selectedServiceObj.description && (
                    <div className="p-3 text-sm text-gray-700">{selectedServiceObj.description}</div>
                  )}
                </div>
              )}

              {!!services.length ? (
                <ul className="space-y-3">
                  {services.map((s) => {
                    const img = getServiceImage(s);
                    const checked = selectedServiceId === s.id;
                    const duration =
                      (s as any).duration ||
                      (s as any)?.details?.duration_label ||
                      ((s as any).duration_minutes ? `${(s as any).duration_minutes} min` : null);
                    return (
                      <li key={`picker-${s.id}`}>
                        <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-300 cursor-pointer">
                          <input
                            type="radio"
                            name="service-picker"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => setSelectedServiceId(s.id)}
                            aria-label={`Select ${s.title || (s as any).service_type}`}
                          />
                          <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                            {img ? <SafeImage src={img} alt="" fill className="object-cover" sizes="56px" /> : <div className="h-full w-full bg-gray-100" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">{s.title || (s as any).service_type}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                              {(s as any).service_type && (
                                <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-0.5 border border-gray-200">
                                  {(s as any).service_type
                                  }</span>
                              )}
                              {duration && <span>{duration}</span>}
                            </div>
                            {s.description && <p className="mt-1 text-[13px] text-gray-600 line-clamp-2">{s.description}</p>}
                          </div>
                          <div className="ml-2 shrink-0 text-sm font-semibold text-gray-900">{formatZAR(getServicePrice(s))}</div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-gray-600">No services available.</p>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setIsServicePickerOpen(false)}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!selectedServiceId) return;
                    const svc = services.find((s) => s.id === selectedServiceId);
                    if (svc) handleBookService(svc);
                    setIsServicePickerOpen(false);
                  }}
                  disabled={!selectedServiceId}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {isShareOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Share profile">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsShareOpen(false)} aria-hidden="true" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] sm:w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-end">
              <button aria-label="Close" onClick={() => setIsShareOpen(false)} className="p-1.5 rounded hover:bg-gray-50">
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <h3 className="font-semibold text-3xl text-gray-900 mb-3">Share</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                {profilePictureUrl ? (
                  <SafeImage src={profilePictureUrl} alt={displayName} fill className="object-cover" sizes="56px" />
                ) : (
                  <div className="h-full w-full bg-gray-100" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{displayName}</p>
                {averageRating && (
                  <p className="text-xs text-gray-600 flex items-center gap-1">
                    <StarIcon className="h-3 w-3 text-yellow-400" /> {averageRating} ({displayReviews.length})
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const url = typeof window !== 'undefined' ? window.location.href : '';
                    await navigator.clipboard.writeText(url);
                    Toast.success('Link copied');
                  } catch {
                    Toast.error('Could not copy link');
                  }
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 text-left"
              >
                <LinkIcon className="h-5 w-5 text-gray-800" />
                Copy Link
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent(displayName)}&body=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.href : ''
                )}`}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline hover:no-underline text-left"
              >
                <EnvelopeIcon className="h-5 w-5 text-gray-800" />
                Email
              </a>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={`sms:&body=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline hover:no-underline text-left"
              >
                <ChatBubbleOvalLeftIcon className="h-5 w-5 text-gray-800" />
                Messages
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline hover:no-underline text-left"
              >
                {/* WA glyph */}
                <svg className="h-5 w-5 text-gray-800" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                  <path d="m26.5 5.427c-2.796-2.8-6.516-4.343-10.479-4.344C7.855 1.083 1.209 7.728 1.206 15.896c-.001 2.611.681 5.16 1.978 7.406l-2.102 7.677 7.853-2.06c2.164 1.181 4.6 1.802 7.079 1.803h.006c8.164 0 14.811-6.646 14.814-14.814.001-3.958-1.538-7.679-4.335-10.48zM16.02 28.22h-.005c-2.209 0-4.376-.595-6.267-1.716l-.45-.267-4.66 1.222 1.244-4.544-.293-.466c-1.232-1.96-1.883-4.226-1.882-6.553C3.751 8.109 9.278 2.585 16.07 2.585c3.289 0 6.38 1.284 8.705 3.611 2.325 2.327 3.604 5.421 3.602 8.711-.003 6.789-5.526 12.313-12.312 12.313zm6.754-9.221c-.37-.185-2.19-1.08-2.53-1.204-.339-.124-.585-.185-.832.185-.246.371-.956 1.205-1.172 1.451-.216.247-.432.278-.802.092-.37-.185-1.563-.576-2.977-1.837-1.1-.982-1.843-2.193-2.059-2.565-.216-.37-.023-.571.162-.755.166-.166.37-.433.556-.649.185-.216.246-.371.37-.617.123-.247.062-.463-.03-.649-.092-.185-.832-2.007-1.141-2.748-.3-.722-.606-.624-.832-.636-.216-.011-.463-.013-.71-.013s-.648.092-.987.463c-.34.371-1.296 1.266-1.296 3.088s1.326 3.582 1.512 3.83c.185.247 2.61 3.985 6.323 5.589.883.381 1.573.609 2.11.78.887.282 1.694.242 2.332.147.711-.107 2.19-.896 2.498-1.76s.308-1.606.216-1.76-.34-.247-.71-.433z" />
                </svg>
                WhatsApp
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.href : ''
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline hover:no-underline text-left"
              >
                {/* FB glyph */}
                <svg className="h-5 w-5 text-gray-800" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                  <path d="M15.97 1C7.702 1 1 7.703 1 15.97c0 7.02 4.834 12.911 11.354 14.529V20.545h-3.087v-4.575h3.087V14c0-5.095 2.306-7.457 7.309-7.457.949 0 2.585.186 3.255.372v4.147c-.353-.037-.967-.056-1.73-.056-2.454 0-3.403.93-3.403 3.347v1.618h4.89l-.84 4.575h-4.05v10.286C28.74 28.536 34.484 22.225 34.484 14.97 34.485 7.702 27.772 1 19.505 1z" />
                </svg>
                Facebook
              </a>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setIsShareOpen(false)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Reviews modal */}
      {isAllReviewsOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="All reviews">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsAllReviewsOpen(false)} aria-hidden="true" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] sm:w-full md:w-auto max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-100 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-end p-3">
              <button aria-label="Close" onClick={() => setIsAllReviewsOpen(false)} className="p-1.5 rounded hover:bg-gray-50">
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Sticky controls */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 pr-3 pl-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-700 pb-6 text-2xl font-semibold">
                  {averageRating ? (
                    <>
                      <StarIcon className="h-7 w-7 text-yellow-400" />
                      <span>{averageRating}</span>
                      <span className="text-gray-400">·</span>
                      <span>{displayReviews.length} Reviews</span>
                    </>
                  ) : (
                    <span>{displayReviews.length} Reviews</span>
                  )}
                </div>
                <div className="relative mb-6 font-bold">
                  <select
                    value={reviewSort}
                    onChange={(e) => setReviewSort(e.target.value as any)}
                    className="appearance-none bg-transparent border border-gray-200 px-2 py-2 rounded-full text-xs text-gray-600  focus:outline-none cursor-pointer"
                  >
                    <option value="recent">Most recent</option>
                    <option value="highest">Highest ratings</option>
                    <option value="lowest">Lowest ratings</option>
                  </select>
                  <ChevronDownIcon className="h-4 w-4 text-gray-500 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="mt-2 relative">
                <MagnifyingGlassIcon className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={reviewQuery}
                  onChange={(e) => setReviewQuery(e.target.value)}
                  placeholder="Search reviews"
                  className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-300 text-sm focus:ring-gray-900 focus:border-gray-900"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <ul className="space-y-4">
                {filteredSortedReviews.map((review) => (
                  <li key={`all-rev-${review.id}`} className="rounded-xl border border-gray-100 p-4 bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <ReviewStars rating={Number(review.rating) || 0} />
                      {review.client?.first_name && (
                        <p className="text-xs font-medium text-gray-700 ml-3">{review.client.first_name}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{review.comment}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Reviewed on: {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setIsAllReviewsOpen(false)} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Details Modal */}
      {isDetailsOpen && detailedService && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Service details">
          <div className="absolute inset-0 bg-black/40 transition-opacity duration-200" onClick={() => setIsDetailsOpen(false)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:inset-auto md:max-w-lg md:max-h-[90vh] md:rounded-2xl transition-all duration-200 md:min-h-[400px]">
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:py-4">
              <div className="mx-auto max-w-5xl flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900 md:text-lg truncate">
                  {detailedService.title || (detailedService as any).service_type}
                </h3>
                <button onClick={() => setIsDetailsOpen(false)} className="p-2 rounded-lg hover:bg-gray-50" aria-label="Close">
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 md:px-6 md:py-4 flex flex-col h-full">
              <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm flex-grow min-h-[200px]">
                <div className="relative h-40 w-full bg-gray-100 md:h-48">
                  {(() => {
                    const img = getServiceImage(detailedService);
                    return img ? <SafeImage src={img} alt="" fill className="object-cover" sizes="100vw" /> : <div className="h-full w-full grid place-items-center text-gray-400">No image available</div>;
                  })()}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate md:text-base">
                          {detailedService.title || (detailedService as any).service_type}
                        </p>
                        <p className="text-white/80 text-xs md:text-sm">
                          {(detailedService as any).service_type}
                          {(detailedService as any).duration ||
                          (detailedService as any)?.details?.duration_label ||
                          (detailedService as any).duration_minutes
                            ? ` • ${
                                (detailedService as any).duration ??
                                (detailedService as any)?.details?.duration_label ??
                                `${(detailedService as any).duration_minutes} min`
                              }`
                            : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-white text-sm font-semibold md:text-base">
                        {formatZAR(getServicePrice(detailedService))}
                      </div>
                    </div>
                  </div>
                </div>
                {detailedService.description && (
                  <div className="p-3 text-sm text-gray-700 whitespace-pre-line md:p-4 md:text-base max-h-40 overflow-y-auto">
                    {detailedService.description}
                  </div>
                )}
              </div>

              <div className="mt-auto flex gap-3 pt-2">
                <button
                  onClick={() => setIsDetailsOpen(false)}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleBookService(detailedService);
                    setIsDetailsOpen(false);
                  }}
                  className="w-1/2 inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition"
                >
                  Book this service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
