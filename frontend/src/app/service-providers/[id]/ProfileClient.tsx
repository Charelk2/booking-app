'use client';

import React, {
  useEffect,
  useMemo,
  useState,
  useDeferredValue,
  startTransition,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import MainLayout from '@/components/layout/MainLayout';
import { BookingProvider } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Toast, Spinner, Avatar } from '@/components/ui';

import type {
  ServiceProviderProfile,
  Service,
  Review as ReviewType,
} from '@/types';
import {
  apiUrl,
  createBookingRequest,
  postMessageToBookingRequest,
  startMessageThread,
} from '@/lib/api';

import {
  StarIcon,
  MapPinIcon,
  UserIcon,
  XMarkIcon,
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

import SafeImage from '@/components/ui/SafeImage';
import {
  getFullImageUrl,
  normalizeService,
  getTownProvinceFromAddress,
} from '@/lib/utils';
import ServiceCard from '@/components/services/ServiceCard';
import AboutSection from '@/components/profile/AboutSection';
import VettedBanner from '@/components/profile/VettedBanner';
import { getServiceDisplay } from '@/lib/display';
import Chip from '@/components/ui/Chip';

const BookingWizard = dynamic(
  () => import('@/components/booking/BookingWizard'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
        <Spinner size="lg" />
      </div>
    ),
  },
);

const BookinWizardPersonilsedVideo = dynamic(
  () => import('@/components/booking/bookinwizardpersonilsedvideo'),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-white/40 backdrop-blur">
        <Spinner size="lg" />
      </div>
    ),
  },
);

// Demo fallback reviews (unchanged behaviour)
const FAKE_REVIEWS: ReviewType[] = [
  // … keep your fake reviews exactly as you had …
  // (omitted here for brevity – paste your existing FAKE_REVIEWS array)
];

function formatZAR(val?: number | string | null) {
  const num = typeof val === 'string' ? parseFloat(val) : val ?? NaN;
  if (!Number.isFinite(num)) return 'Price not available';
  return Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'ZAR',
  }).format(num as number);
}

function ReviewStars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return (
    <div className="flex items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <StarSolidIcon
          key={i}
          className={`h-3 w-3 ${i < full ? 'text-black' : 'text-gray-300'}`}
        />
      ))}
    </div>
  );
}

function ReviewSummary({ reviews }: { reviews: ReviewType[] }) {
  const total = reviews.length;
  const avg = useMemo(() => {
    if (!total) return null;
    const n =
      reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / total;
    return n.toFixed(1);
  }, [reviews, total]);

  if (!total) return null;

  return (
    <div className="mt-8 mb-4 flex items-center gap-2">
      <StarSolidIcon className="h-5 w-5 text-black" />
      <p className="text-lg font-semibold text-gray-900">
        {avg} · {total} {total === 1 ? 'review' : 'reviews'}
      </p>
    </div>
  );
}

function ShareArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function sanitizePolicy(raw?: string | null) {
  if (!raw) return { intro: '', bullets: [] as string[] };
  const lines = String(raw).split(/\r?\n/);
  const filtered = lines.filter(
    (l) => !/^\s*#\s*(Flexible|Moderate|Strict)\s*$/i.test(l),
  );
  const bullets: string[] = [];
  const introParts: string[] = [];
  for (const l of filtered) {
    if (/^\s*-\s+/.test(l)) bullets.push(l.replace(/^\s*-\s+/, '').trim());
    else if (l.trim()) introParts.push(l.trim());
  }
  return { intro: introParts.join(' '), bullets };
}

type Props = {
  serviceProviderId: number;
  initialServiceProvider: ServiceProviderProfile | null;
  initialServices: Service[];
  initialReviews: ReviewType[];
};

export default function ProfileClient({
  serviceProviderId,
  initialServiceProvider,
  initialServices,
  initialReviews,
}: Props) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [serviceProvider] = useState<ServiceProviderProfile | null>(
    initialServiceProvider || null,
  );
  const [services] = useState<Service[]>(() =>
    (initialServices || []).map(normalizeService),
  );
  const [reviews] = useState<ReviewType[]>(initialReviews || []);

  // UI state
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [selectedVideoService, setSelectedVideoService] =
    useState<Service | null>(null);

  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAllReviewsOpen, setIsAllReviewsOpen] = useState(false);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null,
  );
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailedService, setDetailedService] = useState<Service | null>(null);

  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [messageDate, setMessageDate] = useState('');
  const [messageGuests, setMessageGuests] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const [reviewSort, setReviewSort] = useState<'recent' | 'highest' | 'lowest'>(
    'recent',
  );
  const [reviewQuery, setReviewQuery] = useState('');
  const reviewQueryDeferred = useDeferredValue(reviewQuery);

  const displayReviews = useMemo<ReviewType[]>(() => {
    const real = Array.isArray(reviews) ? reviews : [];
    if (real.length >= 10) return real;
    const needed = 10 - real.length;
    return real.concat(FAKE_REVIEWS.slice(0, Math.max(0, needed)));
  }, [reviews]);

  const averageRating = useMemo(() => {
    if (!displayReviews.length) return null;
    const n =
      displayReviews.reduce(
        (sum, r) => sum + (Number(r.rating) || 0),
        0,
      ) / displayReviews.length;
    return n.toFixed(2);
  }, [displayReviews]);

  const filteredSortedReviews = useMemo(() => {
    let arr = [...displayReviews];
    const q = reviewQueryDeferred.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) =>
        (r.comment || '').toLowerCase().includes(q),
      );
    }
    if (reviewSort === 'recent') {
      arr.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime(),
      );
    } else if (reviewSort === 'highest') {
      arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      arr.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }
    return arr;
  }, [displayReviews, reviewQueryDeferred, reviewSort]);

  // Lightweight per-client location for only the first few visible reviews
  const [clientLocations, setClientLocations] = useState<Record<number, string>>(
    {},
  );

  useEffect(() => {
    const subset = displayReviews.slice(0, 6);
    const ids = Array.from(
      new Set(
        subset
          .map((r) => r.client?.id ?? r.client_id)
          .filter(
            (id): id is number => typeof id === 'number' && id > 0,
          ),
      ),
    );
    if (!ids.length) return;

    ids.forEach((id) => {
      if (clientLocations[id]) return;
      (async () => {
        try {
          const res = await fetch(apiUrl(`/api/v1/users/${id}/profile`), {
            credentials: 'include',
          });
          if (!res.ok) return;
          const data: any = await res.json();
          const rawLocation =
            data?.reviews?.[0]?.provider?.location ||
            data?.reviews?.[0]?.provider?.city ||
            '';
          if (!rawLocation) return;
          const formatted =
            getTownProvinceFromAddress(rawLocation) || rawLocation;
          if (!formatted) return;
          setClientLocations((prev) =>
            prev[id] ? prev : { ...prev, [id]: formatted },
          );
        } catch {
          // best-effort
        }
      })();
    });
  }, [displayReviews, clientLocations]);

  const priceBand = useMemo(() => {
    if (!services.length) return null;
    const prices = services
      .map((s) => getServiceDisplay(s).priceNumber)
      .filter(
        (n): n is number =>
          typeof n === 'number' && Number.isFinite(n),
      );
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max
      ? formatZAR(min)
      : `${formatZAR(min)} – ${formatZAR(max)}`;
  }, [services]);

  const highlights: string[] = useMemo(() => {
    const out: string[] = [];
    const sp: any = serviceProvider;
    if (!sp) return out;
    if (Array.isArray(sp.specialties) && sp.specialties.length) {
      out.push(...sp.specialties.slice(0, 3));
    }
    if (sp.owns_pa) out.push('Owns PA');
    if (sp.insured) out.push('Insured');
    if (Array.isArray(sp.languages) && sp.languages.length) {
      out.push(...sp.languages.slice(0, 2));
    }
    if (typeof sp.avg_response_minutes === 'number') {
      out.push(
        sp.avg_response_minutes <= 60
          ? '< 1h response'
          : `~ ${Math.round(sp.avg_response_minutes / 60)}h response`,
      );
    }
    const completedEvents = Number(sp.completed_events || 0);
    if (Number.isFinite(completedEvents) && completedEvents > 0) {
      out.push(
        completedEvents === 1
          ? '1 completed booking'
          : `${completedEvents} completed bookings`,
      );
    }
    if (sp.verified) out.push('Verified');
    return out;
  }, [serviceProvider]);

  const galleryImages = useMemo(() => {
    const sp: any = serviceProvider;
    if (!sp) return [];
    const urls: string[] = [];

    const toImageUrl = (u: string) => getFullImageUrl(u);
    if (Array.isArray(sp.portfolio_image_urls)) {
      urls.push(...(sp.portfolio_image_urls.map(toImageUrl) as string[]));
    }
    if (Array.isArray(sp.portfolio_urls)) {
      urls.push(...(sp.portfolio_urls.map(toImageUrl) as string[]));
    }

    const defaultAvatar = '/default-avatar.svg';
    const imageExt = /\.(png|jpg|jpeg|webp|gif|svg|avif)(\?|$)/i;
    const filtered = urls.filter(
      (u) => u && u !== defaultAvatar && imageExt.test(u),
    );
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const u of filtered) {
      if (!seen.has(u)) {
        seen.add(u);
        deduped.push(u);
      }
    }

    type Parsed = { key: string; ts: number; url: string };
    const parse = (href: string): Parsed => {
      let path = href;
      try {
        path = new URL(href).pathname;
      } catch {}
      const m = path.match(/\/portfolio_images\/(\d{14})_\d+_(.+)$/);
      if (m) {
        const tsNum = Number(m[1]);
        const key = m[2];
        if (Number.isFinite(tsNum)) return { key, ts: tsNum, url: href };
      }
      return { key: path, ts: 0, url: href };
    };
    const byKey = new Map<string, Parsed>();
    for (const u of deduped) {
      const p = parse(u);
      const prev = byKey.get(p.key);
      if (!prev || p.ts > prev.ts) byKey.set(p.key, p);
    }
    return Array.from(byKey.values()).map((p) => p.url);
  }, [serviceProvider]);

  if (!serviceProvider) {
    return (
      <MainLayout hideFooter>
        <div className="text-center py-16 px-6" role="alert">
          <h2 className="text-xl font-semibold text-gray-800">
            Service Provider not found
          </h2>
        </div>
      </MainLayout>
    );
  }

  const coverPhotoUrl = getFullImageUrl(serviceProvider.cover_photo_url);
  const profilePictureUrl = getFullImageUrl(
    serviceProvider.profile_picture_url,
  );
  const displayName =
    serviceProvider.business_name ||
    `${serviceProvider.user.first_name} ${serviceProvider.user.last_name}`;
  const formattedLocation = serviceProvider.location
    ? getTownProvinceFromAddress(serviceProvider.location)
    : '';

  const selectedServiceObj = selectedServiceId
    ? services.find((s) => s.id === selectedServiceId) ?? null
    : null;

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
        service_provider_id: serviceProviderId,
        service_id: service.id,
      });
      router.push(`/booking-requests/${res.data.id}`);
    } catch (err) {
      console.error('Failed to create request', err);
      Toast.error('Failed to create request');
    }
  }

  function openServicePicker(prefillId?: number) {
    if (!services.length) return;
    if (services.length === 1 && !prefillId) {
      void handleBookService(services[0]);
      return;
    }
    startTransition(() => {
      setSelectedServiceId(prefillId ?? null);
      setIsServicePickerOpen(true);
    });
  }

  function openMessageModalOrLogin() {
    if (!authLoading && !user) {
      const next =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : '/inbox';
      router.push(
        `/auth?intent=login&next=${encodeURIComponent(next)}`,
      );
      return;
    }
    setIsMessageOpen(true);
  }

  async function handleSendMessage() {
    if (!messageBody || messageBody.trim().length < 20) return;
    if (!serviceProvider) return;

    try {
      setSendingMessage(true);
      const firstMessage = messageBody.trim();
      let requestId: number | null = null;
      let usedFallback = false;

      try {
        const res = await startMessageThread({
          artist_id: serviceProviderId,
          service_id: selectedServiceId || undefined,
          message: firstMessage,
          proposed_date: messageDate || undefined,
          guests: messageGuests ? Number(messageGuests) : undefined,
        });
        requestId = Number(res.data.booking_request_id);
      } catch (err: any) {
        const status = err?.response?.status || err?.status;
        const msg = (err && err.message) ? String(err.message) : '';
        if (status === 404 || /resource not found/i.test(msg)) {
          usedFallback = true;
          const br = await createBookingRequest({
            service_provider_id: serviceProviderId,
            service_id: selectedServiceId || undefined,
            message: firstMessage,
          } as any);
          requestId = Number(br.data.id);
        } else {
          throw err;
        }
      }

      if (requestId == null) throw new Error('No thread id returned');

      if (usedFallback) {
        try {
          const title = (() => {
            const svc = selectedServiceId
              ? services.find((s) => s.id === selectedServiceId)
              : null;
            return (
              (svc as any)?.title ||
              serviceProvider?.user?.first_name ||
              serviceProvider?.business_name ||
              'Listing'
            );
          })();
          const cover = (() => {
            const svc = selectedServiceId
              ? services.find((s) => s.id === selectedServiceId)
              : null;
            const img = svc ? getServiceDisplay(svc).mediaUrl : null;
            if (img) return img;
            if (serviceProvider?.cover_photo_url)
              return getFullImageUrl(serviceProvider.cover_photo_url);
            if (serviceProvider?.profile_picture_url)
              return getFullImageUrl(serviceProvider.profile_picture_url);
            return null;
          })();
          const view = `/service-providers/${serviceProviderId}`;
          const card = {
            inquiry_sent_v1: {
              title,
              cover,
              view,
              date: messageDate || undefined,
              guests: messageGuests ? Number(messageGuests) : undefined,
            },
          };
          const cid1 =
            typeof crypto !== 'undefined' &&
            (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
          await postMessageToBookingRequest(
            requestId,
            {
              content: JSON.stringify(card),
              message_type: 'USER',
            } as any,
            { clientRequestId: cid1 },
          );
        } catch {
          // non-fatal
        }

        try {
          const cid2 =
            typeof crypto !== 'undefined' &&
            (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : `cid:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
          await postMessageToBookingRequest(
            requestId,
            {
              content: firstMessage,
              message_type: 'USER',
            } as any,
            { clientRequestId: cid2 },
          );
        } catch {
          // non-fatal
        }
      }

      try {
        if (typeof window !== 'undefined' && requestId != null) {
          localStorage.setItem(`inquiry-thread-${requestId}`, '1');
        }
      } catch {}

      router.push(`/inbox?requestId=${requestId}`);
    } catch (err) {
      console.error('Failed to send message', err);
      Toast.error('Failed to send message');
    } finally {
      setSendingMessage(false);
      setIsMessageOpen(false);
      setMessageBody('');
      setMessageDate('');
      setMessageGuests('');
    }
  }

  const cancellation = sanitizePolicy(
    (serviceProvider as any)?.cancellation_policy,
  );

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <>
      <MainLayout hideFooter>
        <div className="bg-white fade-in">
          {/* MOBILE */}
          <section className="md:hidden">
            <div className="relative h-48 w-full overflow-hidden">
              {coverPhotoUrl ? (
                <SafeImage
                  src={coverPhotoUrl}
                  alt="Cover photo"
                  fill
                  priority
                  className="object-cover"
                  sizes="100vw"
                />
              ) : (
                <div className="h-full w-full grid place-items-center text-gray-500">
                  No cover photo
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
            </div>

            <div className="-mt-10 px-4">
              <div className="relative bg-white/90 rounded-2xl shadow-sm border border-gray-100 p-4 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="relative -mt-10 h-20 w-20 shrink-0 rounded-full ring-4 ring-white overflow-hidden bg-gray-200">
                    {profilePictureUrl ? (
                      <SafeImage
                        src={profilePictureUrl}
                        alt={displayName}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="h-full w-full bg-gray-100 grid place-items-center">
                        <UserIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold text-gray-900 truncate">
                      {displayName}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      {formattedLocation && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 border border-gray-200">
                          <MapPinIcon className="h-4 w-4" />
                          {formattedLocation}
                        </span>
                      )}
                      {averageRating && (
                        <button
                          type="button"
                          onClick={() => setIsAllReviewsOpen(true)}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 border border-amber-100 text-amber-700"
                        >
                          <StarIcon className="h-4 w-4" />
                          {averageRating} ({displayReviews.length})
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {serviceProvider.custom_subtitle && (
                  <p className="mt-3 text-sm text-gray-700">
                    {serviceProvider.custom_subtitle}
                  </p>
                )}

                {!!highlights.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {highlights.slice(0, 6).map((h) => (
                      <Chip
                        key={h}
                        leadingIcon={
                          <CheckBadgeIcon className="h-4 w-4" />
                        }
                      >
                        {h}
                      </Chip>
                    ))}
                  </div>
                )}

                {priceBand && (
                  <p className="mt-3 text-sm text-gray-900">
                    <span className="font-semibold">Typical price:</span>{' '}
                    {priceBand}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => openServicePicker()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <BoltIcon className="h-4 w-4" />
                    Book
                  </button>
                  <button
                    type="button"
                    onClick={openMessageModalOrLogin}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                  >
                    <ChatBubbleOvalLeftIcon className="h-4 w-4" />
                    Message
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsShareOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                  >
                    <ShareArrowUpIcon className="h-4 w-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-5xl px-4 mt-6 space-y-8">
              <section id="services" className="mb-16">
                <h2 className="text-lg font-bold text-gray-900">
                  Services
                </h2>
                <div className="mt-4">
                  {services.length ? (
                    <ul className="space-y-3">
                      {services.map((s) => (
                        <li key={`svc-mobile-${s.id}`}>
                          <ServiceCard
                            service={s}
                            variant="mobile"
                            onClick={() => {
                              setDetailedService(s);
                              setIsDetailsOpen(true);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600">
                      This service provider currently has no services
                      listed.
                    </p>
                  )}
                </div>
              </section>

              {(serviceProvider?.description ||
                serviceProvider?.custom_subtitle ||
                highlights.length) && (
                <>
                  <div className="mt-12 mb-8 h-px w-full bg-gray-200" />
                  <AboutSection
                    variant="mobile"
                    displayName={displayName}
                    profilePictureUrl={profilePictureUrl}
                    serviceProvider={serviceProvider}
                    highlights={highlights}
                    onMessageClick={openMessageModalOrLogin}
                  />
                </>
              )}

              <section aria-labelledby="reviews-heading-mobile">
                <h2
                  id="reviews-heading-mobile"
                  className="text-lg font-bold text-gray-900"
                >
                  Reviews
                </h2>
                {displayReviews.length ? (
                  <>
                    <ReviewSummary reviews={displayReviews} />
                    <ul className="mt-3 space-y-3">
                      {displayReviews.slice(0, 6).map((review) => {
                        const clientId =
                          review.client?.id ?? review.client_id;
                        const hasBooking =
                          typeof review.booking_id === 'number' &&
                          review.booking_id > 0;
                        const realReview = Boolean(
                          clientId && hasBooking,
                        );
                        const firstName =
                          review.client?.first_name ||
                          review.client_first_name ||
                          (review.client_display_name || '')
                            .split(' ')[0] ||
                          '';
                        const clientName =
                          firstName ||
                          review.client?.email ||
                          'Client';
                        const clientLocation =
                          typeof clientId === 'number'
                            ? clientLocations[clientId] || ''
                            : '';
                        const initials =
                          review.client?.first_name?.[0] ||
                          clientName.trim().charAt(0) ||
                          '•';
                        const avatarSrc =
                          review.client?.profile_picture_url || null;
                        const reviewedOn = new Date(
                          review.created_at,
                        ).toLocaleDateString('en', {
                          month: 'long',
                          year: 'numeric',
                        });

                        const headerMain = (
                          <div className="flex items-center gap-2">
                            <Avatar
                              src={avatarSrc || undefined}
                              initials={initials}
                              size={28}
                            />
                            <div className="flex flex-col">
                              <p className="text-xs font-semibold text-gray-900">
                                {clientName}
                              </p>
                              {clientLocation && (
                                <p className="text-[11px] text-gray-500">
                                  {clientLocation}
                                </p>
                              )}
                            </div>
                          </div>
                        );

                        return (
                          <li
                            key={`rev-mobile-${review.id}`}
                            className="rounded-xl border border-gray-100 p-3 bg-white"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                              {realReview && clientId ? (
                                <Link
                                  href={`/clients/${clientId}`}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="sm:mr-3"
                                >
                                  {headerMain}
                                </Link>
                              ) : (
                                headerMain
                              )}
                              <div className="flex items-center gap-1 text-xs text-gray-700">
                                <ReviewStars
                                  rating={Number(review.rating) || 0}
                                />
                                <span
                                  aria-hidden
                                  className="text-gray-400"
                                >
                                  •
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {reviewedOn}
                                </span>
                              </div>
                            </div>
                            <p className="text-gray-800 text-sm leading-relaxed">
                              {review.comment}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                    {displayReviews.length > 6 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="w-full inline-flex items-center justify-center rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
                          onClick={() => setIsAllReviewsOpen(true)}
                        >
                          Show all reviews
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600">
                    No reviews yet for this service provider.
                  </p>
                )}
              </section>

              {!!galleryImages.length && (
                <>
                  <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                  <section
                    id="portfolio-mobile"
                    aria-labelledby="portfolio-heading-mobile"
                  >
                    <h2
                      id="portfolio-heading-mobile"
                      className="text-lg font-bold text-gray-900"
                    >
                      My Portfolio
                    </h2>
                    <ul className="mt-3 grid grid-cols-3 gap-2">
                      {galleryImages.slice(0, 9).map((src, i) => (
                        <li
                          key={`portfolio-mobile-${i}`}
                          className="relative aspect-square overflow-hidden rounded-lg border border-gray-100"
                        >
                          <SafeImage
                            src={src}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="33vw"
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              {cancellation.intro || cancellation.bullets.length > 0 ? (
                <>
                  <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                  <section aria-labelledby="policies-heading-mobile">
                    <h2
                      id="policies-heading-mobile"
                      className="text-lg font-bold text-gray-900"
                    >
                      Policies
                    </h2>
                    <div className="mt-3 rounded-2xl border border-gray-100 p-4 bg-gradient-to-br from-white to-gray-50 shadow-sm text-gray-700">
                      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                        Cancellation Policy
                      </p>
                      {cancellation.intro && (
                        <p className="mb-3 leading-relaxed text-sm">
                          {cancellation.intro}
                        </p>
                      )}
                      {!!cancellation.bullets.length && (
                        <ul className="list-disc pl-6 space-y-1 text-sm">
                          {cancellation.bullets.map((b, i) => (
                            <li key={`mobile-pol-${i}`}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                </>
              ) : null}
            </div>

            {!!services.length && (
              <div className="md:hidden sticky bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/80 backdrop-blur px-4 py-3">
                <div className="mx-auto max-w-5xl">
                  <button
                    type="button"
                    onClick={() => openServicePicker()}
                    className="w-full inline-flex items-center justify-center rounded-xl px-4 py-3 text-base font-semibold bg-gradient-to-r from-gray-800 via-black to-gray-800 text-white shadow-sm active:scale-[0.99] transition disabled:opacity-50"
                    disabled={!services.length}
                    aria-label="Request booking"
                  >
                    <BoltIcon className="mr-2 h-5 w-5" />
                    Request booking
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* DESKTOP */}
          <section className="hidden md:block">
            <div className="mx-auto max-w-6xl md:flex bg-white">
              <aside className="md:w-2/5 md:flex md:flex-col bg-white md:sticky md:self-start p-6 border-r border-gray-100">
                <div className="relative h-48 overflow-hidden rounded-3xl shadow-lg">
                  {coverPhotoUrl ? (
                    <SafeImage
                      src={coverPhotoUrl}
                      alt="Cover photo"
                      fill
                      priority
                      className="object-cover rounded-3xl"
                      sizes="40vw"
                    />
                  ) : (
                    <div className="h-full grid place-items-center text-gray-500">
                      No cover photo
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent rounded-3xl" />
                </div>

                <div className="pt-0 bg-white">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative -mt-12">
                      {profilePictureUrl ? (
                        <SafeImage
                          src={profilePictureUrl}
                          width={96}
                          height={96}
                          className="h-24 w-24 rounded-full object-cover shadow-md ring-2 ring-white"
                          alt={displayName}
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-gray-300 grid place-items-center text-gray-500 shadow-md ring-4 ring-white">
                          <UserIcon className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h1 className="mt-4 text-3xl font-bold text-gray-900">
                      {displayName}
                    </h1>

                    {serviceProvider.custom_subtitle && (
                      <p className="mt-1 text-sm text-gray-800">
                        {serviceProvider.custom_subtitle}
                      </p>
                    )}

                    {!!highlights.length && (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                        {highlights.slice(0, 4).map((h) => (
                          <span
                            key={`left-highlight-${h}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-800"
                          >
                            <CheckBadgeIcon className="h-3.5 w-3.5 text-gray-700" />
                            {h}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-gray-800 leading-none">
                      {averageRating && (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1"
                          onClick={() => setIsAllReviewsOpen(true)}
                        >
                          <StarSolidIcon className="h-3 w-3 text-black" />
                          {averageRating} ({displayReviews.length} reviews)
                        </button>
                      )}
                      {averageRating && formattedLocation && (
                        <span
                          aria-hidden
                          className="text-gray-800 text-[10px]"
                        >
                          •
                        </span>
                      )}
                      {formattedLocation && (
                        <span className="flex items-center">
                          {formattedLocation}
                        </span>
                      )}
                    </div>

                    <div className="pt-3 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        className="hover:rounded-full hover:shadow-sm hover:bg-gray-50 p-3"
                        aria-label="Share profile"
                        onClick={() => setIsShareOpen(true)}
                      >
                        <ShareArrowUpIcon className="h-4 w-4 text-gray-900" />
                      </button>
                      <button
                        type="button"
                        className="hover:rounded-full hover:shadow-sm hover:bg-gray-50 p-3"
                        aria-label="Save profile"
                      >
                        <HeartIcon
                          className="h-4 w-4 text-gray-900"
                          strokeWidth={2.5}
                        />
                      </button>
                    </div>
                  </div>

                  {!!services.length && (
                    <div className="mt-4">
                      <div className="rounded-2xl border border-gray-200 bg-white shadow-[0_6px_16px_rgba(0,0,0,0.08)] p-5">
                        <div className="mb-4">
                          <span className="text-xl font-bold text-gray-900">
                            From {priceBand || 'Contact for pricing'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openServicePicker()}
                          className="w-full rounded-xl bg-gradient-to-r from-gray-800 via-black to-gray-800 py-2.5 text-base font-bold text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all"
                        >
                          Request booking
                        </button>
                        <button
                          type="button"
                          onClick={openMessageModalOrLogin}
                          className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          Message {displayName}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </aside>

              <section className="md:w-3/5 p-6 space-y-6">
                <section id="services-desktop" className="pb-6">
                  <h2 className="sr-only">Services</h2>
                  {services.length ? (
                    <ul className="space-y-6">
                      {services.map((s) => (
                        <li key={`service-desktop-${s.id}`}>
                          <ServiceCard
                            service={s}
                            variant="desktop"
                            onClick={() => {
                              setDetailedService(s);
                              setIsDetailsOpen(true);
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600">
                      This service provider currently has no services
                      listed.
                    </p>
                  )}
                </section>

                {(serviceProvider?.description ||
                  serviceProvider?.custom_subtitle ||
                  highlights.length) && (
                  <>
                    <div className="mt-6 mb-4 h-px w-full bg-gray-200" />
                    <AboutSection
                      variant="desktop"
                      displayName={displayName}
                      profilePictureUrl={profilePictureUrl}
                      serviceProvider={serviceProvider}
                      highlights={highlights}
                      onMessageClick={openMessageModalOrLogin}
                    />
                  </>
                )}

                <section
                  aria-labelledby="reviews-heading-desktop"
                  className="pb-10"
                >
                  <div className="h-px w-full bg-gray-200" />
                  <h2
                    id="reviews-heading-desktop"
                    className="mt-10 text-lg font-bold text-gray-800 mb-3"
                  >
                    Reviews
                  </h2>
                  {displayReviews.length ? (
                    <>
                      <ReviewSummary reviews={displayReviews} />
                      <ul className="mt-4 flex flex-wrap gap-3">
                        {displayReviews.slice(0, 6).map((review, idx) => {
                          const clientId =
                            review.client?.id ?? review.client_id;
                          const hasBooking =
                            typeof review.booking_id === 'number' &&
                            review.booking_id > 0;
                          const realReview = Boolean(
                            clientId && hasBooking,
                          );
                          const firstName =
                            review.client?.first_name ||
                            review.client_first_name ||
                            (review.client_display_name || '')
                              .split(' ')[0] ||
                            '';
                          const clientName =
                            firstName ||
                            review.client?.email ||
                            'Client';
                          const clientLocation =
                            typeof clientId === 'number'
                              ? clientLocations[clientId] || ''
                              : '';
                          const initials =
                            review.client?.first_name?.[0] ||
                            clientName.trim().charAt(0) ||
                            '•';
                          const avatarSrc =
                            review.client?.profile_picture_url || null;
                          const reviewedOn = new Date(
                            review.created_at,
                          ).toLocaleDateString('en', {
                            month: 'long',
                            year: 'numeric',
                          });

                          const headerMain = (
                            <div className="flex items-center gap-6">
                              <Avatar
                                src={avatarSrc || undefined}
                                initials={initials}
                                size={42}
                              />
                              <div className="flex flex-col">
                                <p className="text-xs font-semibold text-gray-900">
                                  {clientName}
                                </p>
                                {clientLocation && (
                                  <p className="text-[11px] text-gray-500">
                                    {clientLocation}
                                  </p>
                                )}
                              </div>
                            </div>
                          );

                          return (
                            <li
                              key={`rev-desktop-${review.id}`}
                              className={`w-full md:w-[calc(50%-0.75rem)] rounded-xl bg-white ${
                                idx >= 2 ? 'pt-6' : ''
                              }`}
                            >
                              <div className="mb-4 space-y-2">
                                {realReview && clientId ? (
                                  <Link
                                    href={`/clients/${clientId}`}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="no-underline hover:no-underline"
                                  >
                                    {headerMain}
                                  </Link>
                                ) : (
                                  headerMain
                                )}
                                <div className="flex items-center pt-4 gap-1 text-xs text-gray-700">
                                  <ReviewStars
                                    rating={Number(review.rating) || 0}
                                  />
                                  <span
                                    aria-hidden
                                    className="text-gray-400"
                                  >
                                    •
                                  </span>
                                  <span className="text-[11px] text-gray-500">
                                    {reviewedOn}
                                  </span>
                                </div>
                              </div>
                              <p className="pr-4 text-gray-800 text-sm leading-relaxed">
                                {review.comment}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                      {displayReviews.length > 6 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="w-full inline-flex items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition"
                            onClick={() => setIsAllReviewsOpen(true)}
                          >
                            Show all reviews
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-600">
                      No reviews yet for this service provider.
                    </p>
                  )}
                </section>

                {!!galleryImages.length && (
                  <>
                    <div className="mt-8 mb-6 h-px w-full bg-gray-200" />
                    <section
                      id="portfolio-desktop"
                      aria-labelledby="portfolio-heading-desktop"
                    >
                      <h2
                        id="portfolio-heading-desktop"
                        className="text-2xl font-bold text-gray-800 mb-4"
                      >
                        My Portfolio
                      </h2>
                      <ul className="grid grid-cols-4 gap-2">
                        {galleryImages.slice(0, 9).map((src, i) => (
                          <li
                            key={`portfolio-desktop-${i}`}
                            className="relative aspect-square overflow-hidden rounded-lg border border-gray-100"
                          >
                            <SafeImage
                              src={src}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="33vw"
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  </>
                )}

                {cancellation.intro || cancellation.bullets.length > 0 ? (
                  <>
                    <div className="mt-12 mb-6 h-px w-full bg-gray-200" />
                    <section
                      aria-labelledby="policies-heading-desktop"
                      className="pb-10"
                    >
                      <h2
                        id="policies-heading-desktop"
                        className="text-lg font-bold text-gray-800 mb-3"
                      >
                        Policies
                      </h2>
                      <div className="rounded-2xl border border-gray-100 p-6 bg-gradient-to-br from-white to-gray-50 shadow-sm text-gray-700">
                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
                          Cancellation Policy
                        </p>
                        {cancellation.intro && (
                          <p className="mb-3 leading-relaxed">
                            {cancellation.intro}
                          </p>
                        )}
                        {!!cancellation.bullets.length && (
                          <ul className="list-disc pl-6 space-y-1">
                            {cancellation.bullets.map((b, i) => (
                              <li key={`desktop-pol-${i}`}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  </>
                ) : null}

                <VettedBanner
                  displayName={displayName}
               
                />
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
      {isVideoOpen && selectedVideoService && (
        <BookinWizardPersonilsedVideo
          artistId={serviceProviderId}
          isOpen={isVideoOpen}
          onClose={() => setIsVideoOpen(false)}
          basePriceZar={
            getServiceDisplay(selectedVideoService).priceNumber || 0
          }
          serviceId={selectedVideoService.id}
        />
      )}

      {/* Service Picker Sheet */}
      {isServicePickerOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a service to book"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsServicePickerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:rounded-2xl">
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:rounded-t-2xl">
              <div className="mx-auto max-w-5xl flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Select a service
                </h3>
                <button
                  type="button"
                  onClick={() => setIsServicePickerOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-50"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-600" />
                </button>
              </div>
            </div>
            <div className="px-4 py-3">
              {selectedServiceObj && (() => {
                const d = getServiceDisplay(selectedServiceObj);
                return (
                  <div className="mb-4 overflow-hidden rounded-xl border border-gray-100">
                    <div className="relative h-40 w-full bg-gray-100">
                      {d.mediaUrl ? (
                        <SafeImage
                          src={d.mediaUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="100vw"
                        />
                      ) : (
                        <div className="h-full w-full bg-gray-100" />
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <div className="flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {d.title}
                            </p>
                            <p className="text-white/80 text-xs">
                              {[d.type, d.durationLabel]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>
                          <div className="shrink-0 text-white text-sm font-semibold">
                            {d.priceText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <ul className="space-y-3">
                {services.map((s) => {
                  const selected = selectedServiceId === s.id;
                  const d = getServiceDisplay(s);
                  return (
                    <li key={`svc-pick-${s.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedServiceId(s.id)}
                        className={`w-full rounded-xl border p-3 shadow-sm text-left ${
                          selected
                            ? 'border-gray-900'
                            : 'border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {d.title}
                            </p>
                            <p className="text-xs text-gray-600">
                              {[d.type, d.durationLabel]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          </div>
                          <div className="text-sm text-gray-900 font-semibold">
                            {d.priceText}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsServicePickerOpen(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const svc = selectedServiceId
                      ? services.find((x) => x.id === selectedServiceId)
                      : null;
                    if (svc) handleBookService(svc);
                  }}
                  className="rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
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
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Share profile"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsShareOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-1/2 top-1/2 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-end">
              <button
                aria-label="Close"
                onClick={() => setIsShareOpen(false)}
                className="p-1.5 rounded hover:bg-gray-50"
              >
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <h3 className="font-semibold text-2xl text-gray-900 mb-3">
              Share
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                {profilePictureUrl ? (
                  <SafeImage
                    src={profilePictureUrl}
                    alt={displayName}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                ) : (
                  <div className="h-full w-full bg-gray-100" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {displayName}
                </p>
                {averageRating && (
                  <p className="text-xs text-gray-600 flex items-center gap-1">
                    <StarSolidIcon className="h-3 w-3 text-black" />{' '}
                    {averageRating} ({displayReviews.length})
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const url =
                      typeof window !== 'undefined'
                        ? window.location.href
                        : '';
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
                href={`mailto:?subject=${encodeURIComponent(
                  displayName,
                )}&body=${encodeURIComponent(
                  typeof window !== 'undefined'
                    ? window.location.href
                    : '',
                )}`}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline text-left"
              >
                <EnvelopeIcon className="h-5 w-5 text-gray-800" />
                Email
              </a>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={`sms:&body=${encodeURIComponent(
                  typeof window !== 'undefined'
                    ? window.location.href
                    : '',
                )}`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline text-left"
              >
                <ChatBubbleOvalLeftIcon className="h-5 w-5 text-gray-800" />
                Messages
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  typeof window !== 'undefined'
                    ? window.location.href
                    : '',
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 inline-flex items-center justify-start gap-2 no-underline text-left"
              >
                {/* WhatsApp icon as before */}
                <svg
                  className="h-5 w-5 text-gray-800"
                  viewBox="0 0 32 32"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="m26.4996694 5.42690083c-2.7964463-2.80004133-6.5157025-4.34283558-10.4785124-4.3442562-8.16570245 0-14.81136692 6.64495868-14.81420824 14.81280987-.00142066 2.6110744.68118843 5.1596695 1.97750579 7.4057025l-2.10180992 7.6770248 7.85319008-2.0599173c2.16358679 1.1805785 4.59995039 1.8020661 7.07895869 1.8028099h.0063636c8.1642975 0 14.8107438-6.6457025 14.8135547-14.8135537.001404-3.9585124-1.5378522-7.67985954-4.3350423-10.47990913zm-10.4785124 22.79243797h-.0049587c-2.2090909-.0006611-4.3761983-.5945454-6.26702475-1.7161157l-.44965289-.2670248-4.66034711 1.2223967 1.24375207-4.5438843-.29265289-.4659504c-1.23238843-1.9604132-1.8837438-4.2263636-1.88232464-6.552562.0028453-6.78846276 5.5262172-12.31184293 12.31825021-12.31184293 3.2886777.00142149 6.38 1.28353719 8.7047934 3.61122314 2.3248761 2.32698347 3.6041323 5.42111569 3.6027285 8.71053719-.0028938 6.7891736-5.5261995 12.312562-12.3125632 12.312562zm6.7536364-9.2212396c-.3700827-.1853719-2.1898347-1.0804132-2.5294215-1.203967-.3395041-.1236363-.5859504-.1853719-.8324793.1853719-.2464463.3708265-.9560331 1.2047108-1.1719835 1.4511571-.2159504.24719-.4319008.2777686-.8019835.092314-.37-.1853719-1.5626446-.5760331-2.9768595-1.8368595-1.1002479-.9816529-1.8433058-2.1933884-2.0591735-2.5642149-.2159505-.3707438-.0227273-.5710744.1619008-.7550413.1661983-.1661983.3700826-.432562.5554545-.6485124.1854546-.2159504.246529-.3707438.3700827-.6172727.1236363-.2471901.0618182-.4630579-.0304959-.6485124-.0923967-.1853719-.8324793-2.0073554-1.1414876-2.74818183-.3004959-.72166116-.6058678-.62363637-.8324793-.63571075-.2159504-.01066116-.4623967-.01278512-.7095868-.01278512s-.6478512.09233884-.98735538.46312396c-.33950413.37074381-1.29561157 1.26644624-1.29561157 3.08768594s1.32619008 3.5821488 1.51156195 3.8293389c.1853719.24719 2.6103306 3.9855371 6.3231405 5.5894214.8829752.381405 1.5726447.6094215 2.1103306.7799174.8865289.2819835 1.6933884.2422314 2.3312397.1470248.7110744-.1065289 2.1899173-.8957025 2.4981818-1.7601653s.3082645-1.6060331.2159504-1.7601653c-.092314-.1541322-.3395041-.2471901-.7095868-.432562z" />
                </svg>
                WhatsApp
              </a>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsShareOpen(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All reviews modal */}
      {isAllReviewsOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="All reviews"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsAllReviewsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-1/2 top-1/2 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-100 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-end p-3">
              <button
                aria-label="Close"
                onClick={() => setIsAllReviewsOpen(false)}
                className="p-1.5 rounded hover:bg-gray-50"
              >
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-3 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-700 pb-4 text-xl font-semibold">
                  {averageRating ? (
                    <>
                      <StarSolidIcon className="h-5 w-5 text-black" />
                      <span>{averageRating}</span>
                      <span className="text-gray-400">·</span>
                      <span>{displayReviews.length} Reviews</span>
                    </>
                  ) : (
                    <span>{displayReviews.length} Reviews</span>
                  )}
                </div>
                <div className="relative mb-2">
                  <select
                    value={reviewSort}
                    onChange={(e) =>
                      setReviewSort(e.target.value as any)
                    }
                    className="appearance-none bg-transparent border border-gray-200 px-3 py-2 pr-7 rounded-full text-xs text-gray-600 focus:outline-none cursor-pointer"
                  >
                    <option value="recent">Most recent</option>
                    <option value="highest">Highest ratings</option>
                    <option value="lowest">Lowest ratings</option>
                  </select>
                  <ChevronDownIcon className="h-4 w-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div className="mt-1 relative">
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
                {filteredSortedReviews.map((review) => {
                  const nameFromClient = `${review.client?.first_name || ''} ${
                    review.client?.last_name || ''
                  }`.trim();
                  const clientName =
                    review.client_display_name ||
                    nameFromClient ||
                    review.client?.email ||
                    'Client';
                  const initials =
                    review.client?.first_name?.[0] ||
                    clientName.trim().charAt(0) ||
                    '•';
                  const avatarSrc =
                    review.client?.profile_picture_url || null;
                  const reviewedOn = new Date(
                    review.created_at,
                  ).toLocaleDateString('en');
                  const clientHref =
                    typeof review.client_id === 'number'
                      ? `/clients/${review.client_id}`
                      : review.client?.id
                      ? `/clients/${review.client.id}`
                      : null;

                  const avatarBlock = (
                    <div className="flex items-center gap-4">
                      <Avatar
                        src={avatarSrc || undefined}
                        initials={initials}
                        size={32}
                      />
                      <div className="flex flex-col">
                        <p className="text-xs font-medium text-gray-800">
                          {clientName}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          Reviewed on: {reviewedOn}
                        </p>
                      </div>
                    </div>
                  );

                  return (
                    <li
                      key={`all-rev-${review.id}`}
                      className="rounded-xl border border-gray-100 p-4 bg-white"
                    >
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <ReviewStars
                          rating={Number(review.rating) || 0}
                        />
                        {clientHref ? (
                          <Link
                            href={clientHref}
                            className="ml-3 no-underline hover:no-underline"
                          >
                            {avatarBlock}
                          </Link>
                        ) : (
                          <div className="ml-3">{avatarBlock}</div>
                        )}
                      </div>
                      <p className="text-gray-600 text-xs leading-relaxed">
                        {review.comment}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsAllReviewsOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message modal */}
      {isMessageOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={`Message ${displayName}`}
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMessageOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-xl text-gray-900">
                Message {displayName}
              </h3>
              <button
                aria-label="Close"
                onClick={() => setIsMessageOpen(false)}
                className="p-1.5 rounded hover:bg-gray-50"
              >
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {!!services.length && (
                <div>
                  <label
                    htmlFor="message-service"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Service (optional)
                  </label>
                  <div className="relative">
                    <select
                      id="message-service"
                      value={selectedServiceId ?? ''}
                      onChange={(e) =>
                        setSelectedServiceId(
                          e.target.value
                            ? Number(e.target.value)
                            : null,
                        )
                      }
                      className="w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      <option value="">
                        General inquiry (no service)
                      </option>
                      {services.map((s) => {
                        const d = getServiceDisplay(s);
                        return (
                          <option
                            key={`svc-opt-${s.id}`}
                            value={s.id}
                          >
                            {d.title}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="message-date"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Proposed date (optional)
                  </label>
                  <input
                    id="message-date"
                    type="date"
                    value={messageDate}
                    onChange={(e) => setMessageDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="message-guests"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Guests (optional)
                  </label>
                  <input
                    id="message-guests"
                    inputMode="numeric"
                    pattern="\\d*"
                    value={messageGuests}
                    onChange={(e) =>
                      setMessageGuests(
                        e.target.value.replace(/[^0-9]/g, ''),
                      )
                    }
                    placeholder="e.g. 120"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="message-body"
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  Your message
                </label>
                <textarea
                  id="message-body"
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Describe your event (date, location, timing, budget, special requests). Minimum 20 characters."
                  rows={5}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-y"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Minimum 20 characters</span>
                  <span>{(messageBody || '').length} chars</span>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsMessageOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  disabled={sendingMessage}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={
                    sendingMessage ||
                    !messageBody ||
                    messageBody.trim().length < 20
                  }
                  className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {sendingMessage && <Spinner size="sm" />}
                  Send message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Details Modal */}
      {isDetailsOpen && detailedService && (() => {
        const d = getServiceDisplay(detailedService);
        return (
          <div
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Service details"
          >
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsDetailsOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:inset-auto md:max-w-lg md:max-h-[90vh] md:rounded-2xl">
              <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:py-4">
                <div className="mx-auto max-w-5xl flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900 md:text-lg truncate">
                    {d.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsDetailsOpen(false)}
                    className="p-2 rounded-lg hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3 md:px-6 md:py-4 flex flex-col h-full">
                <div className="mb-4 overflow-hidden rounded-xl border border-gray-100 shadow-sm flex-grow min-h-[200px]">
                  <div className="relative h-40 w-full bg-gray-100 md:h-48">
                    {d.mediaUrl ? (
                      <SafeImage
                        src={d.mediaUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="100vw"
                      />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-gray-400">
                        No image available
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate md:text-base">
                            {d.title}
                          </p>
                          <p className="text-white/80 text-xs md:text-sm">
                            {[d.type, d.durationLabel]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                        <div className="shrink-0 text-white text-sm font-semibold md:text-base">
                          {d.priceText}
                        </div>
                      </div>
                    </div>
                  </div>
                  {detailedService.description && (
                    <div className="p-2 md:p-3 text-sm text-gray-700 whitespace-pre-line md:text-base max-h-40 overflow-y-auto">
                      {detailedService.description}
                    </div>
                  )}
                </div>
                <div className="mt-auto flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsDetailsOpen(false)}
                    className="w-1/2 inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    Close
                  </button>
                  <button
                    type="button"
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
        );
      })()}
    </>
  );
}
