'use client'

import React, { useEffect, useMemo, useState, useDeferredValue, startTransition } from 'react';
import Head from 'next/head';
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
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
  postMessageToBookingRequest,
  startMessageThread,
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
  ShieldCheckIcon,
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
   Policy helpers (format + sanitize)
   ────────────────────────────────────────────────────────────────────────── */
function sanitizePolicy(raw?: string | null) {
  if (!raw) return { intro: '', bullets: [] as string[] };
  const lines = String(raw).split(/\r?\n/);
  // Remove heading lines like "# Flexible", "# Moderate", "# Strict"
  const filtered = lines.filter((l) => !/^\s*#\s*(Flexible|Moderate|Strict)\s*$/i.test(l));
  const bullets: string[] = [];
  const introParts: string[] = [];
  for (const l of filtered) {
    if (/^\s*-\s+/.test(l)) bullets.push(l.replace(/^\s*-\s+/, '').trim());
    else if (l.trim()) introParts.push(l.trim());
  }
  return { intro: introParts.join(' '), bullets };
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */
export default function ServiceProviderProfilePage() {
  // Keep hook order stable forever
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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
  // Message modal state
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [messageDate, setMessageDate] = useState('');
  const [messageGuests, setMessageGuests] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

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
    // Do not include subtitle in highlights; shown separately under name
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
    // de-dup by exact URL
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const u of filtered) if (!seen.has(u)) { seen.add(u); deduped.push(u); }

    // Heuristic: when multiple portfolio filenames share the same trailing
    // original name (e.g., IMG_3132.JPG) but different timestamp prefixes,
    // keep only the entry with the latest timestamp. This avoids showing a
    // stale/nonexistent earlier upload alongside the valid one.
    type Parsed = { key: string; ts: number; url: string };
    const parse = (href: string): Parsed => {
      let path = href;
      try { path = new URL(href).pathname; } catch {}
      // Match "/portfolio_images/<14 digit ts>_<id>_<rest>"
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

  function openMessageModalOrLogin() {
    if (!authLoading && !user) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/inbox';
      router.push(`/login?next=${encodeURIComponent(next)}`);
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
        // Preferred: message-threads/start (if backend supports it)
        const res = await startMessageThread({
          artist_id: serviceProviderId,
          service_id: selectedServiceId || undefined,
          message: firstMessage,
          proposed_date: messageDate || undefined,
          guests: messageGuests ? Number(messageGuests) : undefined,
        });
        requestId = Number(res.data.booking_request_id);
      } catch (err: any) {
        // Fallback for older backends without /message-threads/start
        const status = err?.response?.status || err?.status;
        const msg = (err && err.message) ? String(err.message) : '';
        if (status === 404 || /resource not found/i.test(msg)) {
          usedFallback = true;
          const br = await createBookingRequest({
            artist_id: serviceProviderId,
            service_id: selectedServiceId || undefined,
            message: firstMessage,
          } as any);
          requestId = Number(br.data.id);
        } else {
          throw err;
        }
      }

      if (requestId == null) throw new Error('No thread id returned');
      // If we used fallback, send the inquiry card first so the visible preview remains the user's message
      if (usedFallback) {
        try {
          const title = (() => {
            const svc = selectedServiceId ? services.find((s) => s.id === selectedServiceId) : null;
            return (
              (svc as any)?.title || serviceProvider?.user?.first_name || serviceProvider?.business_name || 'Listing'
            );
          })();
          const cover = (() => {
            const svc = selectedServiceId ? services.find((s) => s.id === selectedServiceId) : null;
            const img = svc ? getServiceImage(svc as any) : null;
            if (img) return img;
            if (serviceProvider?.cover_photo_url) return getFullImageUrl(serviceProvider.cover_photo_url);
            if (serviceProvider?.profile_picture_url) return getFullImageUrl(serviceProvider.profile_picture_url);
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
          await postMessageToBookingRequest(requestId, {
            content: JSON.stringify(card),
            message_type: 'USER',
          } as any);
        } catch (e) {
          // Non-fatal
        }
      }
      // Post the actual first message only for fallback; the backend route already posts it
      if (usedFallback) {
        try {
          await postMessageToBookingRequest(requestId, {
            content: firstMessage,
            message_type: 'USER',
          } as any);
        } catch (e) {
          // Non-fatal; the thread still exists, the user can retry from inbox
        }
      }
      try {
        if (typeof window !== 'undefined' && requestId != null) {
          // Mark this thread as a message-started inquiry so the inbox can show the INQUIRY chip
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
        <div className="bg-white fade-in">
          {/* ======================== MOBILE ======================== */}
          <section className="md:hidden">
            {/* Hero */}
            <div className="relative h-48 w-full overflow-hidden">
              {coverPhotoUrl ? (
                <SafeImage
                  src={coverPhotoUrl}
                  alt="Cover photo"
                  fill
                  priority
                  fetchPriority="high"
                  {...{ elementtiming: 'LCP-hero' }}
                  className="object-cover"
                  sizes="100vw"
                  placeholder="blur"
                  blurDataURL={BLUR_PLACEHOLDER}
                />
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
                      <SafeImage src={profilePictureUrl} alt={displayName} fill className="object-cover" sizes="80px" placeholder="blur" blurDataURL={BLUR_PLACEHOLDER} />
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

                {serviceProvider.custom_subtitle && (
                  <p className="mt-3 text-sm text-gray-700">{serviceProvider.custom_subtitle}</p>
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

                {/* Quick Actions */}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => openMobileServicePicker()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                  >
                    <BoltIcon className="h-4 w-4" />
                    Book
                  </button>
                  <button
                    onClick={openMessageModalOrLogin}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                  >
                    <ChatBubbleOvalLeftIcon className="h-4 w-4" />
                    Message
                  </button>
                  <button
                    onClick={() => setIsShareOpen(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                  >
                    <ShareIcon className="h-4 w-4" />
                    Share
                  </button>
                </div>
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
                        // Align mobile thumbnail source with desktop: prefer media_url only
                        const img = getFullImageUrl((s as any).media_url) || (s as any).media_url || null;
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
                                <div className="relative aspect-square w-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                  {img ? (
                                    <SafeImage src={img} alt="" fill className="object-cover" sizes="(max-width: 640px) 64px, (max-width: 1024px) 96px, 128px" />
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

              {/* About/Bio (mobile) */}
{/* ──────────────────────────────────────────────────────────────────────────
   About / Meet your host — upgraded
   - Accessible header + clean divider
   - Avatar + name/role row
   - Smart highlight chips (location, languages, experience, rating, bookings)
   - Elegant Read more/less with <details> (no React state needed)
   - Zero conditional hooks; purely declarative
   - Mobile-first, subtle glow, no heavy borders
   ────────────────────────────────────────────────────────────────────────── */}
{(serviceProvider?.description || true) && (
  <>
    <div className="mt-12 mb-8 h-px w-full bg-gray-200" />

    <section id="about-desktop" aria-labelledby="about-heading-desktop" className="group">
      <h2 id="about-heading-desktop" className="text-2xl font-bold tracking-tight text-gray-900">
        About
      </h2>

      <div className="mt-4 relative isolate overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800 md:p-8">
        {/* soft background glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-400/10"
        />

        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 dark:ring-gray-700">
            {profilePictureUrl ? (
              <SafeImage
                src={profilePictureUrl}
                alt={displayName || 'Profile photo'}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-gray-400">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor">
                  <path strokeWidth="1.5" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Name / Role / Chips */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">{displayName}</p>
              {serviceProvider?.primary_role && (
                <span className="text-sm text-gray-600 dark:text-gray-300">· {serviceProvider.primary_role}</span>
              )}
            </div>

            {/* Smart highlight chips (computed inline, no hooks) */}
            <div className="mt-3 flex flex-wrap gap-2">
              {(() => {
                const chips: string[] = [];

                if (serviceProvider?.location) chips.push(`Based in ${serviceProvider.location}`);

                if (Array.isArray(serviceProvider?.languages) && serviceProvider.languages.length) {
                  chips.push(`Languages: ${serviceProvider.languages.slice(0, 3).join(', ')}${serviceProvider.languages.length > 3 ? '…' : ''}`);
                }

                const years = (serviceProvider as any)?.years_experience ?? (serviceProvider as any)?.yearsExperience ?? (serviceProvider as any)?.experience_years;
                if (typeof years === 'number' && years > 0) chips.push(`${years}+ yrs experience`);

                const rating = (serviceProvider as any)?.rating_avg ?? (serviceProvider as any)?.ratingAverage ?? (serviceProvider as any)?.rating;
                const ratingCount = (serviceProvider as any)?.rating_count ?? (serviceProvider as any)?.reviews_count ?? (serviceProvider as any)?.reviewsCount;
                if (typeof rating === 'number' && ratingCount) chips.push(`${rating.toFixed(1)}★ (${ratingCount})`);

                const bookings = (serviceProvider as any)?.completed_bookings ?? (serviceProvider as any)?.bookings_count;
                if (typeof bookings === 'number' && bookings > 0) chips.push(`${bookings} bookings on Booka`);

                // Optional responsiveness badge if you store reply minutes
                const replyMins = (serviceProvider as any)?.reply_minutes ?? (serviceProvider as any)?.avg_reply_minutes;
                if (typeof replyMins === 'number' && replyMins >= 0) {
                  let label = 'Usually replies ';
                  if (replyMins < 60) label += `in < ${Math.max(1, Math.round(replyMins / 10) * 10)} min`;
                  else if (replyMins < 180) label += `within ~${Math.round(replyMins / 60)} h`;
                  else label += 'within a day';
                  chips.push(label);
                }

                return chips.slice(0, 6).map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-800/60 dark:text-gray-200 dark:ring-gray-700"
                  >
                    {c}
                  </span>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Description preview + graceful expand/collapse (no state) */}
        {serviceProvider?.description && (() => {
          const raw = String(serviceProvider.description).trim();
          const m = raw.match(/(.+?[.!?])(\s|$)/);
          const first = m ? m[1] : raw;
          const rest = raw.slice(first.length).trim();
          return (
            <div className="mt-4">
              <p className="text-sm text-gray-800 dark:text-gray-100">{first}</p>
              {rest && (
                <details className="mt-2 group/open">
                  <summary className="mb-2 cursor-pointer list-none text-sm font-medium text-gray-900 hover:opacity-80 dark:text-gray-100">
                    <span className="underline decoration-dotted underline-offset-4">Read more</span>
                  </summary>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p className="whitespace-pre-line">{rest}</p>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 group-open:hidden">Tip: click again to collapse</div>
                  <div className="mt-2 hidden text-xs text-gray-500 group-open:block">Click to collapse</div>
                </details>
              )}
            </div>
          );
        })()}

        {/* Message button + microcopy */}
        <div className="mt-4">
                        <button onClick={openMessageModalOrLogin} className="w-full inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white">
                          <ChatBubbleOvalLeftIcon className="h-5 w-5 mr-2" />
                          Message {displayName}
                        </button>
          <p className="mt-2 text-[11px] text-gray-500">
            To help protect your payment, always use Booka to send money and communicate with artists.
          </p>
        </div>
      </div>
    </section>

    <div className="mt-12 mb-6 h-px w-full bg-gray-200" />
  </>
)}


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
                        {displayReviews.slice(0, 4).map((review) => (
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
                      {displayReviews.length > 4 && (
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

              {(serviceProvider as any)?.cancellation_policy && (() => {
                const { intro, bullets } = sanitizePolicy((serviceProvider as any).cancellation_policy);
                return (
                  <>
                    <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                    <section aria-labelledby="policies-heading">
                      <h2 id="policies-heading" className="text-lg font-bold text-gray-900">
                        Policies
                      </h2>
                      <div className="mt-3 rounded-2xl border border-gray-100 p-5 text-sm text-gray-700 bg-gradient-to-br from-white to-gray-50 shadow-sm">
                        <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Cancellation Policy</p>
                        {intro && <p className="mb-3 leading-relaxed">{intro}</p>}
                        {!!bullets.length && (
                          <ul className="list-disc pl-5 space-y-1">
                            {bullets.map((b, i) => (
                              <li key={`mobile-pol-${i}`}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  </>
                );
              })()}

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
                    <BoltIcon className="mr-2 h-5 w-5" />
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

                    {serviceProvider.custom_subtitle && (
                      <p className="mt-2 text-sm text-gray-600">{serviceProvider.custom_subtitle}</p>
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
                      
                    </div>
                  </div>

                  {/* Sticky Action Dock (left rail) */}
                  {!!services.length && (
                    <div
                      className="mt-6 sticky z-10"
                      style={{ top: 'calc(100vh - 9.5rem)' }}
                      aria-label="Quick booking actions"
                    >
                      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-600">
                            {priceBand ? (
                              <>
                                <span className="font-semibold text-gray-900">Typical price:</span> {priceBand}
                              </>
                            ) : (
                              'Select a service to see pricing'
                            )}
                          </div>
                          <ShieldCheckIcon className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => openMobileServicePicker()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                          >
                            <BoltIcon className="h-4 w-4" />
                            Request booking
                          </button>
                            <button
                              onClick={openMessageModalOrLogin}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                            >
                              <ChatBubbleOvalLeftIcon className="h-4 w-4" />
                              Message
                            </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Removed desktop policy from left rail; moved to right panel below portfolio */}
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

                {/* About/Bio (desktop) */}
{/* ──────────────────────────────────────────────────────────────────────────
   About / Meet your host — upgraded
   - Accessible header + clean divider
   - Avatar + name/role row
   - Smart highlight chips (location, languages, experience, rating, bookings)
   - Elegant Read more/less with <details> (no React state needed)
   - Zero conditional hooks; purely declarative
   - Mobile-first, subtle glow, no heavy borders
   ────────────────────────────────────────────────────────────────────────── */}
{(serviceProvider?.description || true) && (
  <>
    <div className="mt-12 mb-8 h-px w-full bg-gray-200" />

    <section id="about-desktop" aria-labelledby="about-heading-desktop" className="group">
      <h2 id="about-heading-desktop" className="text-2xl font-bold tracking-tight text-gray-900">
        About
      </h2>

      <div className="mt-4 relative isolate overflow-hidden rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800 md:p-8">
        {/* soft background glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-400/10"
        />

        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 dark:ring-gray-700">
            {profilePictureUrl ? (
              <SafeImage
                src={profilePictureUrl}
                alt={displayName || 'Profile photo'}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-gray-400">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor">
                  <path strokeWidth="1.5" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"/>
                </svg>
              </div>
            )}
          </div>

          {/* Name / Role / Chips */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p className="truncate text-lg font-semibold text-gray-900 dark:text-white">{displayName}</p>
              {serviceProvider?.primary_role && (
                <span className="text-sm text-gray-600 dark:text-gray-300">· {serviceProvider.primary_role}</span>
              )}
            </div>

            {/* Smart highlight chips (computed inline, no hooks) */}
            <div className="mt-3 flex flex-wrap gap-2">
              {(() => {
                const chips: string[] = [];

                if (serviceProvider?.location) chips.push(`Based in ${serviceProvider.location}`);

                if (Array.isArray(serviceProvider?.languages) && serviceProvider.languages.length) {
                  chips.push(`Languages: ${serviceProvider.languages.slice(0, 3).join(', ')}${serviceProvider.languages.length > 3 ? '…' : ''}`);
                }

                const years = (serviceProvider as any)?.years_experience ?? (serviceProvider as any)?.yearsExperience ?? (serviceProvider as any)?.experience_years;
                if (typeof years === 'number' && years > 0) chips.push(`${years}+ yrs experience`);

                const rating = (serviceProvider as any)?.rating_avg ?? (serviceProvider as any)?.ratingAverage ?? (serviceProvider as any)?.rating;
                const ratingCount = (serviceProvider as any)?.rating_count ?? (serviceProvider as any)?.reviews_count ?? (serviceProvider as any)?.reviewsCount;
                if (typeof rating === 'number' && ratingCount) chips.push(`${rating.toFixed(1)}★ (${ratingCount})`);

                const bookings = (serviceProvider as any)?.completed_bookings ?? (serviceProvider as any)?.bookings_count;
                if (typeof bookings === 'number' && bookings > 0) chips.push(`${bookings} bookings on Booka`);

                // Optional responsiveness badge if you store reply minutes
                const replyMins = (serviceProvider as any)?.reply_minutes ?? (serviceProvider as any)?.avg_reply_minutes;
                if (typeof replyMins === 'number' && replyMins >= 0) {
                  let label = 'Usually replies ';
                  if (replyMins < 60) label += `in < ${Math.max(1, Math.round(replyMins / 10) * 10)} min`;
                  else if (replyMins < 180) label += `within ~${Math.round(replyMins / 60)} h`;
                  else label += 'within a day';
                  chips.push(label);
                }

                return chips.slice(0, 6).map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200 dark:bg-gray-800/60 dark:text-gray-200 dark:ring-gray-700"
                  >
                    {c}
                  </span>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* Description preview + graceful expand/collapse (no state) */}
        {serviceProvider?.description && (() => {
          const raw = String(serviceProvider.description).trim();
          const m = raw.match(/(.+?[.!?])(\s|$)/);
          const first = m ? m[1] : raw;
          const rest = raw.slice(first.length).trim();
          return (
            <div className="mt-4">
              <p className="text-sm text-gray-800 dark:text-gray-100">{first}</p>
              {rest && (
                <details className="mt-2 group/open">
                  <summary className="mb-2 cursor-pointer list-none text-sm font-medium text-gray-900 hover:opacity-80 dark:text-gray-100">
                    <span className="underline decoration-dotted underline-offset-4">Read more</span>
                  </summary>
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <p className="whitespace-pre-line">{rest}</p>
                  </div>
                  
                  <div className="mt-2 hidden text-xs text-gray-500 group-open:block">Click to collapse</div>
                </details>
              )}
            </div>
          );
        })()}

        {/* Message button + microcopy */}
        <div className="mt-4">
                        <button onClick={openMessageModalOrLogin} className="w-full inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white">
                          <ChatBubbleOvalLeftIcon className="h-5 w-5 mr-2" />
                          Message {displayName}
                        </button>
          <p className="mt-2 text-[11px] text-gray-500">
            To help protect your payment, always use Booka to send money and communicate with artists.
          </p>
        </div>
      </div>
    </section>

    <div className="mt-12 mb-6 h-px w-full bg-gray-200" />
  </>
)}


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

                {(serviceProvider as any)?.cancellation_policy && (() => {
                  const { intro, bullets } = sanitizePolicy((serviceProvider as any).cancellation_policy);
                  return (
                    <>
                      <div className="mt-16 mb-10 h-px w-full bg-gray-200" />
                      <section aria-labelledby="policies-heading-desktop">
                        <h2 id="policies-heading-desktop" className="text-2xl font-bold text-gray-800 mb-1">
                          Policies
                        </h2>
                        <div className="rounded-2xl border border-gray-100 p-6 bg-gradient-to-br from-white to-gray-50 shadow-sm text-gray-700">
                          <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Cancellation Policy</p>
                          {intro && <p className="mb-3 leading-relaxed">{intro}</p>}
                          {!!bullets.length && (
                            <ul className="list-disc pl-6 space-y-1">
                              {bullets.map((b, i) => (
                                <li key={`desktop-pol-${i}`}>{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </section>
                    </>
                  );
                })()}

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

      {/* Service Picker Sheet (mobile + desktop) */}
      {isServicePickerOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Choose a service to book">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsServicePickerOpen(false)} aria-hidden="true" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl
                       md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl md:rounded-2xl"
          >
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:rounded-t-2xl">
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
                          <div className="ml-2 shrink-0 flex flex-col items-end gap-1">
                            <div className="text-sm font-semibold text-gray-900">{formatZAR(getServicePrice(s))}</div>
                            {checked && (
                              <>
                                {/* Desktop per-card Continue */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleBookService(s);
                                    setIsServicePickerOpen(false);
                                  }}
                                  className="hidden md:inline-flex rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 active:scale-[0.99]"
                                  aria-label={`Continue with ${s.title || (s as any).service_type}`}
                                >
                                  Continue
                                </button>
                                {/* Mobile per-card Go button (appears after selection) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleBookService(s);
                                    setIsServicePickerOpen(false);
                                  }}
                                  className="md:hidden inline-flex rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 active:scale-[0.99]"
                                  aria-label={`Go with ${s.title || (s as any).service_type}`}
                                >
                                  Go
                                </button>
                              </>
                            )}
                          </div>
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

      {/* Message Modal */}
      {isMessageOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Write a message to ${displayName}`}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsMessageOpen(false)} aria-hidden="true" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] sm:w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-100 p-0 overflow-hidden">
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div />
              <button aria-label="Close" onClick={() => setIsMessageOpen(false)} className="p-2 rounded hover:bg-gray-50">
                <XMarkIcon className="h-5 w-5 text-gray-600" />
              </button>
            </header>
            <div className="px-4 py-4">
              <h2 id="send-inquiry-title" className="text-xl font-semibold text-gray-900">Write a message to {displayName}</h2>
              <p className="mt-1 text-sm text-gray-600">You can also add booking details for them to review.</p>

              <div className="mt-3">
                <label htmlFor="message-text" className="sr-only">Message</label>
                <textarea
                  id="message-text"
                  aria-labelledby="send-inquiry-title"
                  rows={7}
                  minLength={20}
                  placeholder={`Example: Hi! I'm planning a birthday and was wondering if you're available ${new Date().toLocaleString('default',{ month:'long'})} ${new Date().getDate()} for about 50 guests.`}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 focus:outline-none"
                />
                <div className="mt-1 text-xs text-gray-500">{Math.min(messageBody.length, 999)}/20 required characters</div>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-900">Add optional details</h3>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">When</label>
                    <input type="date" value={messageDate} onChange={(e) => setMessageDate(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Guests</label>
                    <input type="number" min="1" inputMode="numeric" value={messageGuests} onChange={(e) => setMessageGuests(e.target.value)} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none" placeholder="e.g. 50" />
                  </div>
                </div>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setIsMessageOpen(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={sendingMessage || messageBody.trim().length < 20}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sendingMessage ? 'Sending…' : 'Send message'}
              </button>
            </footer>
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
                  <path d="m26.4996694 5.42690083c-2.7964463-2.80004133-6.5157025-4.34283558-10.4785124-4.3442562-8.16570245 0-14.81136692 6.64495868-14.81420824 14.81280987-.00142066 2.6110744.68118843 5.1596695 1.97750579 7.4057025l-2.10180992 7.6770248 7.85319008-2.0599173c2.16358679 1.1805785 4.59995039 1.8020661 7.07895869 1.8028099h.0063636c8.1642975 0 14.8107438-6.6457025 14.8135547-14.8135537.001404-3.9585124-1.5378522-7.67985954-4.3350423-10.47990913zm-10.4785124 22.79243797h-.0049587c-2.2090909-.0006611-4.3761983-.5945454-6.26702475-1.7161157l-.44965289-.2670248-4.66034711 1.2223967 1.24375207-4.5438843-.29265289-.4659504c-1.23238843-1.9604132-1.8837438-4.2263636-1.88232464-6.552562.0028453-6.78846276 5.5262172-12.31184293 12.31825021-12.31184293 3.2886777.00142149 6.38 1.28353719 8.7047934 3.61122314 2.3248761 2.32698347 3.6041323 5.42111569 3.6027285 8.71053719-.0028938 6.7891736-5.5261995 12.312562-12.3125632 12.312562zm6.7536364-9.2212396c-.3700827-.1853719-2.1898347-1.0804132-2.5294215-1.203967-.3395041-.1236363-.5859504-.1853719-.8324793.1853719-.2464463.3708265-.9560331 1.2047108-1.1719835 1.4511571-.2159504.24719-.4319008.2777686-.8019835.092314-.37-.1853719-1.5626446-.5760331-2.9768595-1.8368595-1.1002479-.9816529-1.8433058-2.1933884-2.0591735-2.5642149-.2159505-.3707438-.0227273-.5710744.1619008-.7550413.1661983-.1661983.3700826-.432562.5554545-.6485124.1854546-.2159504.246529-.3707438.3700827-.6172727.1236363-.2471901.0618182-.4630579-.0304959-.6485124-.0923967-.1853719-.8324793-2.0073554-1.1414876-2.74818183-.3004959-.72166116-.6058678-.62363637-.8324793-.63571075-.2159504-.01066116-.4623967-.01278512-.7095868-.01278512s-.6478512.09233884-.98735538.46312396c-.33950413.37074381-1.29561157 1.26644624-1.29561157 3.08768594s1.32619008 3.5821488 1.51156195 3.8293389c.1853719.24719 2.6103306 3.9855371 6.3231405 5.5894214.8829752.381405 1.5726447.6094215 2.1103306.7799174.8865289.2819835 1.6933884.2422314 2.3312397.1470248.7110744-.1065289 2.1899173-.8957025 2.4981818-1.7601653s.3082645-1.6060331.2159504-1.7601653c-.092314-.1541322-.3395041-.2471901-.7095868-.432562z" />
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
                  <path d="m15.9700599 1c-8.26766469 0-14.9700599 6.70239521-14.9700599 14.9700599 0 7.0203593 4.83353293 12.9113772 11.3538922 14.5293413v-9.954491h-3.08682633v-4.5748503h3.08682633v-1.9712575c0-5.09520959 2.305988-7.45688623 7.3083832-7.45688623.948503 0 2.58503.18622754 3.2544911.37185629v4.14670654c-.3532934-.0371257-.9670659-.0556886-1.7293414-.0556886-2.454491 0-3.402994.9299401-3.402994 3.3473054v1.6179641h4.8898204l-.8401198 4.5748503h-4.0497006v10.2856287c7.4125749-.8952096 13.1562875-7.2065868 13.1562875-14.860479-.0005988-8.26766469-6.702994-14.9700599-14.9706587-14.9700599z" />
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
