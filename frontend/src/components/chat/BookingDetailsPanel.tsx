'use client';

import React from 'react';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import BookingSummaryCard from '@/components/chat/BookingSummaryCard';
import {
  getEventPrep,
  getMyServices,
  getBookingRequestById,
  getServiceProviderProfileMe,
  getBookingIdForRequest,
  getBookingRequestCached,
  getQuoteV2,
} from '@/lib/api';
import { AddServiceCategorySelector } from '@/components/dashboard';
import { getBookingDetails } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';
import EventPrepCard from '@/components/booking/EventPrepCard';

const providerIdentityCache = new Map<number, { name: string | null; avatar: string | null }>();

const normalizeIdentityString = (value: unknown): string | null => {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

// DONT DELETE: provider self identity cache ensures providers always see their own business profile instead of counterparty fallbacks.
let selfProviderIdentityCache: { name: string | null; avatar: string | null } | null = null;
let selfProviderIdentityPromise:
  | Promise<{ name: string | null; avatar: string | null }>
  | null = null;

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

const DETAIL_KEYS: (keyof ParsedBookingDetails)[] = [
  'eventType',
  'description',
  'date',
  'location',
  'guests',
  'venueType',
  'soundNeeded',
  'notes',
];

type PaymentInitArgs = { bookingRequestId: number; amount: number; customerEmail?: string; providerName?: string; serviceName?: string };

interface BookingDetailsPanelProps {
  bookingRequest: BookingRequest;
  parsedBookingDetails: ParsedBookingDetails | null;
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
  quotes: Record<number, QuoteV2>;
  quotesLoading: boolean;
  paymentStatus: string | null;
  paymentAmount: number | null;
  receiptUrl: string | null;
  paymentReference: string | null;
  openPaymentModal: (args: PaymentInitArgs) => void;
  onBookingDetailsParsed?: (details: ParsedBookingDetails | null) => void;
  onBookingDetailsHydrated?: (details: ParsedBookingDetails) => void;
  onHydratedBookingRequest?: (request: BookingRequest) => void;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
  quotes,
  quotesLoading,
  paymentStatus,
  paymentAmount,
  receiptUrl,
  paymentReference,
  openPaymentModal,
  onBookingDetailsParsed,
  onBookingDetailsHydrated,
  onHydratedBookingRequest,
}: BookingDetailsPanelProps) {
  const { user } = useAuth();
  const [eventType, setEventType] = React.useState<string | null>(null);
  const [guestsCount, setGuestsCount] = React.useState<number | null>(null);
  const [services, setServices] = React.useState<any[] | null>(null);
  const [loadingServices, setLoadingServices] = React.useState(false);
  const [showAddService, setShowAddService] = React.useState(false);
  const router = useRouter();
  const requestId = React.useMemo(() => Number(bookingRequest?.id || 0), [bookingRequest?.id]);
  const providerProfile = React.useMemo(() => {
    return (
      (bookingRequest as any)?.service_provider_profile ||
      (bookingRequest as any)?.artist_profile ||
      null
    );
  }, [bookingRequest]);

  const viewerIsProvider = React.useMemo(() => {
    return Boolean(user && user.user_type === 'service_provider');
  }, [user]);

  const viewerIsClient = user?.user_type === 'client';

  const [selfProviderIdentity, setSelfProviderIdentity] = React.useState<{
    name: string | null;
    avatar: string | null;
  } | null>(null);

  const derivedProviderIdentity = React.useMemo(() => {
    const identity: { name: string | null; avatar: string | null } = { name: null, avatar: null };

    const nameCandidates = [
      providerProfile?.business_name,
      (bookingRequest as any)?.service_provider_profile?.business_name,
      (bookingRequest as any)?.artist_profile?.business_name,
      (bookingRequest as any)?.service_provider?.business_name,
      (bookingRequest as any)?.service?.service_provider_profile?.business_name,
      (bookingRequest as any)?.service?.artist_profile?.business_name,
      (bookingRequest as any)?.service?.service_provider?.business_name,
      (bookingRequest as any)?.service?.artist?.business_name,
    ];
    for (const candidate of nameCandidates) {
      const next = normalizeIdentityString(candidate);
      if (next) {
        identity.name = next;
        break;
      }
    }

    const avatarCandidates = [
      providerProfile?.profile_picture_url,
      (bookingRequest as any)?.service_provider_profile?.profile_picture_url,
      (bookingRequest as any)?.artist_profile?.profile_picture_url,
      (bookingRequest as any)?.service_provider?.profile_picture_url,
      (bookingRequest as any)?.service?.service_provider_profile?.profile_picture_url,
      (bookingRequest as any)?.service?.artist_profile?.profile_picture_url,
      (bookingRequest as any)?.service?.service_provider?.profile_picture_url,
      (bookingRequest as any)?.service?.artist?.profile_picture_url,
    ];
    for (const candidate of avatarCandidates) {
      const next = normalizeIdentityString(candidate);
      if (next) {
        identity.avatar = next;
        break;
      }
    }

    if (viewerIsProvider) {
      if (!identity.name && selfProviderIdentity?.name) {
        identity.name = normalizeIdentityString(selfProviderIdentity.name) ?? identity.name;
      }
      if (!identity.avatar) {
        identity.avatar = normalizeIdentityString(user?.profile_picture_url) ?? identity.avatar;
      }
      if (!identity.avatar && selfProviderIdentity?.avatar) {
        identity.avatar = normalizeIdentityString(selfProviderIdentity.avatar) ?? identity.avatar;
      }
    } else {
      if (!identity.name) {
        identity.name = normalizeIdentityString((bookingRequest as any)?.counterparty_label) ?? identity.name;
      }
      if (!identity.avatar) {
        identity.avatar = normalizeIdentityString((bookingRequest as any)?.counterparty_avatar_url) ?? identity.avatar;
      }
    }

    return identity;
  }, [
    viewerIsProvider,
    providerProfile,
    bookingRequest,
    user?.profile_picture_url,
    selfProviderIdentity?.name,
    selfProviderIdentity?.avatar,
  ]);

  const derivedProviderName = derivedProviderIdentity.name;
  const derivedProviderAvatar = derivedProviderIdentity.avatar;

  // Hydrate a missing Booking object after payment/confirmation so the summary card
  // can render invoice links via /invoices/{invoice_id} or /invoices/by-booking/{id}.
  const [hydratedBooking, setHydratedBooking] = React.useState<Booking | null>(null);
  const bookingHydrateAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    bookingHydrateAttemptedRef.current = false;
  }, [bookingRequest?.id]);

  React.useEffect(() => {
    const threadId = Number(bookingRequest?.id || 0);
    const alreadyHave = Boolean(confirmedBookingDetails && confirmedBookingDetails.id);
    if (alreadyHave || !threadId) return;

    // For clients, hydrate as soon as the thread is opened so
    // review eligibility and booking metadata are available early.
    // For providers, keep the existing guard so we only fetch once
    // payment/confirmation has happened.
    const paid = String(paymentStatus || '').toLowerCase() === 'paid';
    const confirmed = Boolean(bookingConfirmed);
    if (!viewerIsClient && !(paid || confirmed)) return;
    if (bookingHydrateAttemptedRef.current) return;
    bookingHydrateAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        // 1) Try cached mapping first
        let bid = 0;
        try {
          const cached = sessionStorage.getItem(`bookingId:br:${threadId}`);
          bid = cached ? Number(cached) : 0;
        } catch {}
        // 2) Resolve via API if needed
        if (!Number.isFinite(bid) || bid <= 0) {
          try {
            const res = await getBookingIdForRequest(threadId);
            bid = Number((res as any)?.data?.booking_id || 0);
          } catch {}
        }
        if (!Number.isFinite(bid) || bid <= 0) return;
        // 3) Fetch the booking details
        const r = await getBookingDetails(bid);
        if (!cancelled) {
          setHydratedBooking(r.data as Booking);
          try { sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid)); } catch {}
        }
      } catch {
        // best-effort only
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedBookingDetails, bookingConfirmed, paymentStatus, bookingRequest?.id, viewerIsClient]);

  React.useEffect(() => {
    if (!viewerIsProvider) return;
    if (selfProviderIdentityCache) {
      setSelfProviderIdentity(selfProviderIdentityCache);
      return;
    }
    let cancelled = false;
    if (!selfProviderIdentityPromise) {
      selfProviderIdentityPromise = getServiceProviderProfileMe()
        .then((res) => {
          const payload = {
            name: normalizeIdentityString(res?.data?.business_name),
            avatar: normalizeIdentityString(res?.data?.profile_picture_url),
          };
          selfProviderIdentityCache = payload;
          return payload;
        })
        .catch(() => {
          const payload = { name: null, avatar: null };
          selfProviderIdentityCache = payload;
          return payload;
        })
        .finally(() => {
          selfProviderIdentityPromise = null;
        });
    }
    selfProviderIdentityPromise
      ?.then((payload) => {
        if (!cancelled) setSelfProviderIdentity(payload);
      })
      .catch(() => {
        if (!cancelled) setSelfProviderIdentity({ name: null, avatar: null });
      });
    return () => {
      cancelled = true;
    };
  }, [viewerIsProvider]);

  const cachedIdentity = React.useMemo(() => {
    if (!requestId) return null;
    return providerIdentityCache.get(requestId) ?? null;
  }, [requestId]);

  const initialProviderName = React.useMemo(() => {
    if (viewerIsProvider) {
      return derivedProviderName ?? selfProviderIdentity?.name ?? null;
    }
    return cachedIdentity?.name ?? derivedProviderName ?? null;
  }, [viewerIsProvider, derivedProviderName, cachedIdentity?.name, selfProviderIdentity?.name]);

  const initialProviderAvatar = React.useMemo(() => {
    if (viewerIsProvider) {
      return derivedProviderAvatar ?? selfProviderIdentity?.avatar ?? null;
    }
    return cachedIdentity?.avatar ?? derivedProviderAvatar ?? null;
  }, [viewerIsProvider, derivedProviderAvatar, cachedIdentity?.avatar, selfProviderIdentity?.avatar]);

  const [providerName, setProviderName] = React.useState<string | null>(initialProviderName);
  const [providerAvatarUrl, setProviderAvatarUrl] = React.useState<string | null>(initialProviderAvatar);
  const canonicalFetchedRef = React.useRef(false);
  const hasParsedDetails = React.useMemo(() => {
    return DETAIL_KEYS.some((key) => {
      const value = parsedBookingDetails?.[key];
      return value != null && String(value).trim().length > 0;
    });
  }, [parsedBookingDetails]);

  React.useEffect(() => {
    canonicalFetchedRef.current = false;
  }, [requestId]);

  React.useEffect(() => {
    const bid = (confirmedBookingDetails as any)?.id;
    if (!bid) return;
    // If parsed booking details or local state already provide quick info, skip eager fetch
    const alreadyHave = Boolean(eventType) || Boolean(parsedBookingDetails?.eventType) || (guestsCount != null) || Boolean(parsedBookingDetails?.guests);
    if (alreadyHave) return;
    let cancelled = false;
    let handle: number | null = null;
    const schedule = (fn: () => void) => {
      try {
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout?: number }) => number);
        if (typeof ric === 'function') {
          handle = ric(fn, { timeout: 2000 });
          return;
        }
      } catch {}
      handle = window.setTimeout(fn, 1200);
    };
    schedule(() => {
      if (cancelled) return;
      getEventPrep(bid)
        .then((ep) => {
          if (cancelled) return;
          const et = (ep as any)?.event_type || null;
          const gc = (ep as any)?.guests_count;
          setEventType(et ? String(et) : null);
          setGuestsCount(typeof gc === 'number' ? gc : (gc != null ? Number(gc) : null));
          const fallback: ParsedBookingDetails = {};
          if (et) fallback.eventType = String(et);
          if (typeof gc === 'number') fallback.guests = String(gc);
          if ((ep as any)?.notes) fallback.notes = String((ep as any)?.notes);
          const venueAddress =
            (ep as any)?.venue_address ||
            (ep as any)?.venue_name ||
            (ep as any)?.venue_description ||
            null;
          if (venueAddress) fallback.location = String(venueAddress);
          const fallbackDate =
            (confirmedBookingDetails as any)?.start_time ||
            (bookingRequest as any)?.proposed_datetime_1 ||
            (bookingRequest as any)?.proposed_datetime_2 ||
            (bookingRequest as any)?.event_date ||
            null;
          if (fallbackDate) fallback.date = String(fallbackDate);
          const soundContext = (bookingRequest as any)?.sound_context;
          const soundRequired =
            (bookingRequest as any)?.sound_required ??
            (bookingRequest as any)?.sound_needed ??
            (soundContext ? soundContext.sound_required : undefined);
          if (typeof soundRequired === 'boolean') {
            fallback.soundNeeded = soundRequired ? 'Yes' : 'No';
          } else if (typeof soundRequired === 'string' && soundRequired.trim().length) {
            fallback.soundNeeded = soundRequired.trim();
          } else if (soundContext?.mode && soundContext.mode !== 'none') {
            fallback.soundNeeded = 'Yes';
          }
          if (Object.keys(fallback).length) {
            try { onBookingDetailsHydrated?.(fallback); } catch {}
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      try {
        const cic = (window as any).cancelIdleCallback as undefined | ((h: number) => void);
        if (handle != null) {
          if (typeof cic === 'function') cic(handle);
          else clearTimeout(handle);
        }
      } catch {}
    };
  }, [
    confirmedBookingDetails?.id,
    confirmedBookingDetails?.start_time,
    parsedBookingDetails?.eventType,
    parsedBookingDetails?.guests,
    eventType,
    guestsCount,
    bookingRequest,
    onBookingDetailsHydrated,
  ]);

  // Reset provider identity whenever we switch threads or the payload updates
  React.useLayoutEffect(() => {
    if (providerName !== initialProviderName) {
      setProviderName(initialProviderName);
    }
    if (providerAvatarUrl !== initialProviderAvatar) {
      setProviderAvatarUrl(initialProviderAvatar);
    }
  }, [initialProviderName, initialProviderAvatar, providerName, providerAvatarUrl]);

  React.useEffect(() => {
    if (!requestId) return;
    const nextName = providerName ?? null;
    const nextAvatar = providerAvatarUrl ?? null;
    if (nextName == null && nextAvatar == null) {
      providerIdentityCache.delete(requestId);
      return;
    }
    const existing = providerIdentityCache.get(requestId);
    if (existing && existing.name === nextName && existing.avatar === nextAvatar) return;
    providerIdentityCache.set(requestId, { name: nextName, avatar: nextAvatar });
  }, [requestId, providerName, providerAvatarUrl]);

  // Load canonical provider identity if missing (ensures both roles see the same info)
  React.useEffect(() => {
    const profileHasName = Boolean(providerProfile?.business_name);
    const profileHasAvatar = Boolean(providerProfile?.profile_picture_url);
    const needIdentity = !(profileHasName && profileHasAvatar);
    const needDetails = !hasParsedDetails;
    const needCanonical = needIdentity || needDetails;
    if (canonicalFetchedRef.current) return;
    if (!needCanonical) return;
    if (!Number.isFinite(requestId) || requestId <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getBookingRequestCached(requestId);
        if (cancelled) return;
        canonicalFetchedRef.current = true;
        const profile =
          (data as any)?.service_provider_profile ||
          (data as any)?.artist_profile ||
          null;
        const responseIdentity = {
          profile,
          service_provider_profile: (data as any)?.service_provider_profile,
          artist_profile: (data as any)?.artist_profile,
          service_provider: (data as any)?.service_provider,
          service: (data as any)?.service,
        } as Record<string, any>;

        const canonicalNameCandidates: Array<unknown> = [
          responseIdentity.profile?.business_name,
          responseIdentity.service_provider_profile?.business_name,
          responseIdentity.artist_profile?.business_name,
          responseIdentity.service_provider?.business_name,
          responseIdentity.service?.service_provider_profile?.business_name,
          responseIdentity.service?.artist_profile?.business_name,
          responseIdentity.service?.service_provider?.business_name,
          responseIdentity.service?.artist?.business_name,
        ];

        let canonicalName: string | null = null;
        for (const candidate of canonicalNameCandidates) {
          const normalized = normalizeIdentityString(candidate);
          if (normalized) {
            canonicalName = normalized;
            break;
          }
        }
        if (!canonicalName) {
          canonicalName =
            derivedProviderName ??
            selfProviderIdentity?.name ??
            (viewerIsProvider ? null : providerName ?? null);
        }

        const canonicalAvatarCandidates: Array<unknown> = [
          responseIdentity.profile?.profile_picture_url,
          responseIdentity.service_provider_profile?.profile_picture_url,
          responseIdentity.artist_profile?.profile_picture_url,
          responseIdentity.service_provider?.profile_picture_url,
          responseIdentity.service?.service_provider_profile?.profile_picture_url,
          responseIdentity.service?.artist_profile?.profile_picture_url,
          responseIdentity.service?.service_provider?.profile_picture_url,
          responseIdentity.service?.artist?.profile_picture_url,
        ];

        let canonicalAvatar: string | null = null;
        for (const candidate of canonicalAvatarCandidates) {
          const normalized = normalizeIdentityString(candidate);
          if (normalized) {
            canonicalAvatar = normalized;
            break;
          }
        }
        if (!canonicalAvatar) {
          canonicalAvatar =
            derivedProviderAvatar ??
            selfProviderIdentity?.avatar ??
            providerAvatarUrl ??
            null;
        }
        if (canonicalName !== providerName) setProviderName(canonicalName);
        if (canonicalAvatar !== providerAvatarUrl) setProviderAvatarUrl(canonicalAvatar);
        if (canonicalName || canonicalAvatar) {
          providerIdentityCache.set(requestId, {
            name: canonicalName ?? null,
            avatar: canonicalAvatar ?? null,
          });
        }
        const detailsMessage = (data as any)?.booking_details_message;
        if (detailsMessage) {
          try {
            const parsed = parseBookingDetailsFromMessage(detailsMessage);
            if (Object.keys(parsed).length) onBookingDetailsHydrated?.(parsed);
            onBookingDetailsParsed?.(parsed);
          } catch {}
        }
        try { onHydratedBookingRequest?.(data as BookingRequest); } catch {}
      } catch {
        // leave placeholders; upstream data must be fixed
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    requestId,
    providerName,
    providerAvatarUrl,
    providerProfile?.business_name,
    providerProfile?.profile_picture_url,
    derivedProviderName,
    derivedProviderAvatar,
    viewerIsProvider,
    selfProviderIdentity?.name,
    selfProviderIdentity?.avatar,
    hasParsedDetails,
    onHydratedBookingRequest,
    bookingRequest,
  ]);

  // Detect Booka moderation thread (system-only updates)
  const isBookaThread = React.useMemo(() => {
    try {
      const synthetic = Boolean((bookingRequest as any)?.is_booka_synthetic);
      const txt = String((bookingRequest as any)?.last_message_content || '')
        .trim()
        .toLowerCase();
      return (
        synthetic ||
        txt === 'booka update' ||
        /^listing\s+(approved|rejected)\s*:/.test(String((bookingRequest as any)?.last_message_content || ''))
      );
    } catch {
      return false;
    }
  }, [bookingRequest]);

  // Load my services for Booka panel (useful links + quick overview)
  React.useEffect(() => {
    if (!isBookaThread || user?.user_type !== 'service_provider') return;
    let cancelled = false;
    setLoadingServices(true);
    getMyServices()
      .then((res) => {
        if (cancelled) return;
        setServices(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setServices([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingServices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isBookaThread, user?.user_type]);

  // Determine service type once for conditional UI
  const serviceTypeText = String(
    bookingRequest.service?.service_type ||
    bookingRequest.service?.service_category?.name ||
    ''
  ).toLowerCase();
  const isPersonalized = serviceTypeText.includes('personalized video');
  const effectiveBooking = (confirmedBookingDetails || hydratedBooking) as (Booking & { review?: Review }) | null;

  const [reviewedByClient, setReviewedByClient] = React.useState(false);

  React.useEffect(() => {
    const threadId = Number(bookingRequest?.id || 0);
    if (!threadId || typeof window === 'undefined') {
      setReviewedByClient(false);
      return;
    }
    try {
      const key = `bookingReviewedByClientThread:${threadId}`;
      const val = window.sessionStorage.getItem(key);
      setReviewedByClient(val === '1');
    } catch {
      setReviewedByClient(false);
    }
  }, [bookingRequest?.id]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ threadId?: number }>).detail || {};
        const tid = Number(detail.threadId || 0);
        if (tid && tid === Number(bookingRequest?.id || 0)) {
          setReviewedByClient(true);
        }
      } catch {
        // no-op
      }
    };
    if (typeof window === 'undefined') return () => {};
    window.addEventListener('booking:clientReviewed', handler as EventListener);
    return () => {
      window.removeEventListener('booking:clientReviewed', handler as EventListener);
    };
  }, [bookingRequest?.id]);

  const canClientReviewProvider =
    viewerIsClient &&
    !effectiveBooking?.review &&
    !reviewedByClient;

  const clientReviewCta = canClientReviewProvider ? (
    <button
      type="button"
      onClick={() => setShowReviewModal(true)}
      className="inline-flex w-full items-center justify-center rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="mr-1 h-4 w-4 text-yellow-400"
      >
        <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
      </svg>
      Leave review
    </button>
  ) : null;

  // Render a rich, action‑oriented panel for Booka updates
  if (isBookaThread) {
    const currentArtistId =
      (bookingRequest as any).service_provider_id ||
      (bookingRequest as any).artist_id ||
      (bookingRequest as any).artist?.id ||
      (bookingRequest as any).artist_profile?.user_id ||
      (bookingRequest as any).service?.service_provider_id ||
      (bookingRequest as any).service?.artist_id ||
      (bookingRequest as any).service?.artist?.user_id ||
      0;

    return (
      <div className="w-full flex flex-col h-full">
        <h4 className="px-4 text-base font-semibold text-gray-900">Booka Updates</h4>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700 leading-6">
            We use this thread to send important updates about your listings and account.
            You’ll see approvals, rejections, and tips to improve your profile here.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            <a
              href="/dashboard/artist"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Go to Dashboard</div>
              <div className="text-sm text-gray-700">Overview of your account and activity</div>
            </a>
            <a
              href="/dashboard/artist?tab=services"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Manage Services</div>
              <div className="text-sm text-gray-700">Create, update, or reorder your listings</div>
            </a>
            <a
              href="/dashboard/profile/edit"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Edit Profile</div>
              <div className="text-sm text-gray-700">Update photos, bio, genres, and pricing</div>
            </a>
            <a
              href={`/service-providers/${currentArtistId || ''}`}
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">View Public Profile</div>
              <div className="text-sm text-gray-700">Preview how clients see your page</div>
            </a>
            <a
              href="/dashboard/artist?tab=calendar"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Connect Google Calendar</div>
              <div className="text-sm text-gray-700">Keep availability up to date automatically</div>
            </a>
            <a
              href="/support"
              className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 no-underline hover:no-underline"
            >
              <div className="font-semibold text-gray-900">Get Help</div>
              <div className="text-sm text-gray-700">Chat with support or read FAQs</div>
            </a>
          </div>

          <div className="mt-5">
            <div className="font-semibold mb-2">Your Services</div>
            {loadingServices ? (
              <div className="text-sm text-gray-600">Loading services…</div>
            ) : (services && services.length > 0) ? (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100 bg-gray-50">
                {services.slice(0, 6).map((s) => (
                  <li key={s.id} className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{s.title}</div>
                      <div className="text-xs text-gray-600 truncate">
                        {(s.service_category?.name || s.service_type || 'Service')}
                        {s.price ? ` • ZAR ${Number(s.price).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={
                        'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ' +
                        (String(s.status).toLowerCase() === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : String(s.status).toLowerCase() === 'rejected'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200')
                      }>
                        {(String(s.status || 'pending_review').replace('_', ' ')).toUpperCase()}
                      </span>
                      <a
                        href={`/dashboard/artist?tab=services&serviceId=${s.id}`}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 no-underline hover:no-underline"
                      >
                        Edit
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-600">
                No services yet. <a href="/dashboard/artist?tab=services" className="text-indigo-700 font-semibold hover:text-indigo-800 no-underline hover:no-underline">Add your first service</a> to get listed.
              </div>
            )}
          </div>

          {/* Full-width action buttons below services */}
          <div className="mt-6 space-y-2">
            <button
              type="button"
              className="w-full block rounded-lg bg-black text-white px-4 py-2.5 text-sm font-semibold hover:bg-gray-900"
              onClick={() => setShowAddService(true)}
            >
              Create new service
            </button>
            <a
              href="/help/moderation"
              className="w-full block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
            >
              Learn how moderation works
            </a>
            <a
              href="/support"
              className="w-full block text-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 no-underline hover:no-underline"
            >
              Contact support
            </a>
          </div>
        </div>

        {/* Inline category selector modal → routes to dashboard wizard */}
        <AddServiceCategorySelector
          isOpen={showAddService}
          onClose={() => setShowAddService(false)}
          onSelect={(catId) => {
            setShowAddService(false);
            try {
              router.push(`/dashboard/artist?tab=services&addCategory=${encodeURIComponent(catId)}`);
            } catch {}
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">

      {/* Removed the compact event glance to avoid duplication with the scrollable details */}
      {(() => {
        // Derive a robust artist/provider id for links and context
        const currentArtistId =
          // Canonical request-level id
          (bookingRequest as any).service_provider_id ||
          // Legacy alias
          (bookingRequest as any).artist_id ||
          // Expanded relations
          (bookingRequest as any).service_provider?.id ||
          (bookingRequest as any).artist?.id ||
          (bookingRequest as any).service_provider_profile?.user_id ||
          (bookingRequest as any).artist_profile?.user_id ||
          // From the linked service (canonical + deprecated + nested)
          (bookingRequest as any).service?.service_provider_id ||
          (bookingRequest as any).service?.artist_id ||
          (bookingRequest as any).service?.artist?.user_id ||
          0;

        const resolvedAvatar = providerAvatarUrl ?? derivedProviderAvatar ?? null;
        const resolvedName = providerName ?? derivedProviderName ?? null;

        const imageUrl = resolvedAvatar ? String(resolvedAvatar) : null;
        const artistName = resolvedName ?? undefined;

        const cancellationPolicy =
          (bookingRequest as any)?.service_provider_profile?.cancellation_policy ??
          (bookingRequest as any)?.artist_profile?.cancellation_policy ??
          null;

        const isPaid = String(paymentStatus || '').toLowerCase() === 'paid';
        // Determine acceptance from quotes map
        const accepted = (() => {
          try {
            const values = Object.values(quotes || {}) as any[];
            const threadId = Number(bookingRequest?.id || 0);
            return values.some((q: any) => Number(q?.booking_request_id) === threadId && String(q?.status || '').toLowerCase().includes('accept'));
          } catch { return false; }
        })();
        const showPrep = isPaid || accepted;

        return (
          <BookingSummaryCard
            parsedBookingDetails={parsedBookingDetails ?? undefined}
            imageUrl={imageUrl}
            serviceName={bookingRequest.service?.title}
            artistName={artistName}
            bookingConfirmed={bookingConfirmed}
            quotesLoading={quotesLoading}
            paymentInfo={{
              status: paymentStatus,
              amount: paymentAmount,
              receiptUrl,
              reference:
                paymentReference ??
                (confirmedBookingDetails?.payment_id
                  ? String(confirmedBookingDetails.payment_id)
                  : null),
            }}
            bookingDetails={confirmedBookingDetails || hydratedBooking}
            quotes={quotes}
            allowInstantBooking={false}
            openPaymentModal={openPaymentModal}
            bookingRequestId={bookingRequest.id}
            baseFee={Number(bookingRequest.service?.price || 0)}
            travelFee={Number(bookingRequest.travel_cost || 0)}
            initialSound={
              String(parsedBookingDetails?.soundNeeded || '')
                .trim()
                .toLowerCase() === 'yes'
            }
            artistCancellationPolicy={cancellationPolicy}
            currentArtistId={Number(currentArtistId) || 0}
            // Always render all sections for clarity
            showTravel={true}
            showSound={true}
            showPolicy={true}
            showEventDetails={true}
            showReceiptBelowTotal={isPersonalized}
            clientReviewCta={clientReviewCta}
            belowHeader={
              showPrep ? (
                  <EventPrepCard
                    bookingId={Number(confirmedBookingDetails?.id || 0) || 0}
                    bookingRequestId={Number(bookingRequest.id)}
                    canEdit={true}
                    summaryOnly
                    linkOnly
                    headlineOnly
                    onContinuePrep={async (bidFromProp: number) => {
                      try {
                        if (Number.isFinite(bidFromProp) && bidFromProp > 0) {
                          try { window.location.href = `/dashboard/events/${bidFromProp}`; } catch {}
                          return;
                    }
                    const threadId = Number(bookingRequest.id) || 0;
                    if (!threadId) return;
                    // 1) Cached mapping
                    try {
                      const cached = sessionStorage.getItem(`bookingId:br:${threadId}`);
                      const bid = cached ? Number(cached) : 0;
                      if (Number.isFinite(bid) && bid > 0) {
                        try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                        return;
                      }
                    } catch {}
                    // 2) Direct resolver
                    try {
                      const res = await getBookingIdForRequest(threadId);
                      const bid = Number((res as any)?.data?.booking_id || 0);
                      if (Number.isFinite(bid) && bid > 0) {
                        try { sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid)); } catch {}
                        try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                        return;
                      }
                    } catch {}
                    // 3) Look for accepted quote locally or via cached request
                    try {
                      const values = Object.values(quotes || {}) as any[];
                      let acceptedId = 0;
                      for (const q of values) {
                        const s = String(q?.status || '').toLowerCase();
                        if (Number(q?.booking_request_id) === threadId && s.includes('accept')) {
                          acceptedId = Number(q?.id || 0);
                          break;
                        }
                      }
                      if (!acceptedId) {
                        try {
                          const br = await getBookingRequestCached(threadId);
                          acceptedId = Number((br as any)?.accepted_quote_id || 0);
                        } catch {}
                      }
                      if (acceptedId > 0) {
                        const v2 = await getQuoteV2(acceptedId);
                        const bid = Number((v2 as any)?.data?.booking_id || 0);
                        if (Number.isFinite(bid) && bid > 0) {
                          try { sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid)); } catch {}
                          try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                          return;
                        }
                      }
                    } catch {}
                  } catch {}
                }}
                  />
                ) : null
            }
          />
        );
      })()}
      {paymentModal}
    </div>
  );
}
// moved to chat folder
