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
import { videoOrderApiClient } from '@/features/booking/personalizedVideo/engine/apiClient';

const BACKLINE_LABELS: Record<string, string> = {
  drums_full: 'Drum kit (full)',
  drum_shells: 'Drum shells',
  guitar_amp: 'Guitar amp',
  bass_amp: 'Bass amp',
  keyboard_amp: 'Keyboard amp',
  keyboard_stand: 'Keyboard stand',
  piano_digital_88: 'Digital piano (88‑key)',
  piano_acoustic_upright: 'Upright piano',
  piano_acoustic_grand: 'Grand piano',
  dj_booth: 'DJ booth / table',
};

const formatBacklineLabel = (key: string): string => {
  return BACKLINE_LABELS[key] || key.replace(/_/g, ' ');
};

const providerIdentityCache = new Map<number, { name: string | null; avatar: string | null }>();
const ENABLE_PV_ORDERS =
  (process.env.NEXT_PUBLIC_ENABLE_PV_ORDERS ?? '') === '1';

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
  time?: string;
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
  'time',
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
  const { user, loading: authLoading } = useAuth();
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
    const uid = user?.id;
    const raw: any = bookingRequest;
    const providerId =
      Number(raw?.service_provider_id ||
        raw?.artist_id ||
        raw?.artist?.id ||
        raw?.artist_profile?.user_id ||
        0);
    return Boolean(uid && providerId && uid === providerId);
  }, [user, bookingRequest]);

  const viewerIsClient = React.useMemo(() => {
    const uid = user?.id;
    const raw: any = bookingRequest;
    const clientId = Number(raw?.client_id || 0);
    return Boolean(uid && clientId && uid === clientId);
  }, [user, bookingRequest]);

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

  // Hydrate a missing Booking object so the summary card can render invoice links
  // via /invoices/{invoice_id} or /invoices/by-booking/{id}.
  const [hydratedBooking, setHydratedBooking] = React.useState<Booking | null>(null);

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
  }, [confirmedBookingDetails, bookingConfirmed, paymentStatus, bookingRequest?.id, viewerIsClient]);

  // When a Personalized Video order is manually marked completed, a Booking row is created
  // server-side so existing review/invoice flows can reuse Booking endpoints. This event
  // allows the details panel to re-hydrate immediately without a hard refresh.
  React.useEffect(() => {
    if (typeof window === 'undefined') return () => {};
    let cancelled = false;

    const handler = (event: Event) => {
      try {
        const detail = (event as CustomEvent<{ threadId?: number }>).detail || {};
        const threadId = Number(detail.threadId || 0);
        if (!threadId || threadId !== Number(bookingRequest?.id || 0)) return;
        const alreadyHave = Boolean(confirmedBookingDetails && confirmedBookingDetails.id);
        if (alreadyHave) return;
        (async () => {
          try {
            const res = await getBookingIdForRequest(threadId);
            const bid = Number((res as any)?.data?.booking_id || 0);
            if (!Number.isFinite(bid) || bid <= 0) return;
            const r = await getBookingDetails(bid);
            if (cancelled) return;
            setHydratedBooking(r.data as Booking);
            try { sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid)); } catch {}
          } catch {
            // best-effort only
          }
        })();
      } catch {
        // no-op
      }
    };

    window.addEventListener('pv:completed', handler as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('pv:completed', handler as EventListener);
    };
  }, [bookingRequest?.id, confirmedBookingDetails]);

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
  const [pvBriefLink, setPvBriefLink] = React.useState<string | null>(null);
  const [pvBriefComplete, setPvBriefComplete] = React.useState(false);
  const [pvOrderId, setPvOrderId] = React.useState<number | null>(null);
  const [pvDeliveryByUtc, setPvDeliveryByUtc] = React.useState<string | null>(null);
  const [pvOrderStatus, setPvOrderStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isPersonalized || typeof window === 'undefined') {
      setPvBriefLink(null);
      setPvBriefComplete(false);
      setPvOrderId(null);
      setPvDeliveryByUtc(null);
      setPvOrderStatus(null);
      return;
    }
    const tid = Number(bookingRequest?.id || 0);
    if (!tid) return;
    const update = () => {
      try {
        const oid = localStorage.getItem(`vo-order-for-thread-${tid}`);
        const resolved = oid || (ENABLE_PV_ORDERS ? String(tid) : null);
        if (resolved) {
          const resolvedId = Number(resolved);
          setPvOrderId(Number.isFinite(resolvedId) && resolvedId > 0 ? resolvedId : null);
          setPvBriefLink(`/video-orders/${resolved}/brief`);
          setPvBriefComplete(!!localStorage.getItem(`vo-brief-complete-${resolved}`));
        } else {
          setPvBriefLink(null);
          setPvBriefComplete(false);
          setPvOrderId(null);
        }
      } catch {
        setPvBriefLink(null);
        setPvBriefComplete(false);
        setPvOrderId(null);
      }
    };
    update();
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('storage', update);
      window.removeEventListener('focus', update);
    };
  }, [bookingRequest?.id, isPersonalized]);

  React.useEffect(() => {
    if (!isPersonalized || !pvOrderId) {
      setPvDeliveryByUtc(null);
      setPvOrderStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const order = await videoOrderApiClient.getOrder(pvOrderId);
        if (cancelled) return;
        setPvDeliveryByUtc(order?.delivery_by_utc || null);
        setPvOrderStatus(String(order?.status || '').toLowerCase() || null);
      } catch {
        if (!cancelled) setPvDeliveryByUtc(null);
        if (!cancelled) setPvOrderStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPersonalized, pvOrderId]);

  const pvDeliveryLabel = React.useMemo(() => {
    if (!pvDeliveryByUtc) return null;
    try {
      const d = parseISO(String(pvDeliveryByUtc));
      if (!isValid(d)) return null;
      return format(d, 'EEE, d MMM yyyy');
    } catch {
      return null;
    }
  }, [pvDeliveryByUtc]);
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

  const bookingStatus = String(effectiveBooking?.status || '').toLowerCase();
  const isCompletedBooking = bookingStatus === 'completed';
  const canClientReviewProvider =
    viewerIsClient &&
    isCompletedBooking &&
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

  // Detect sound‑booking threads so we can surface a concise Tech & Backline
  // summary for the sound provider (and client) using the normalized rider
  // snapshot propagated from the main artist booking.
  const soundParentId = (() => {
    try {
      return Number((bookingRequest as any).parent_booking_request_id || 0);
    } catch {
      return 0;
    }
  })();
  const isSoundThread = soundParentId > 0 || serviceTypeText.includes('sound service');

  const techBacklineCard = (() => {
    if (!isSoundThread) return null;
    let tb: any = {};
    try {
      tb = ((bookingRequest as any).travel_breakdown || {}) as any;
    } catch {
      tb = {};
    }
    const ruRaw: any = tb?.rider_units || {};
    const backRaw: any = tb?.backline_requested || {};
    const toInt = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const units = {
      vocal_mics: toInt((ruRaw as any).vocal_mics ?? (ruRaw as any).vocalMics),
      speech_mics: toInt((ruRaw as any).speech_mics ?? (ruRaw as any).speechMics),
      monitor_mixes: toInt((ruRaw as any).monitor_mixes ?? (ruRaw as any).monitorMixes),
      iem_packs: toInt((ruRaw as any).iem_packs ?? (ruRaw as any).iemPacks),
      di_boxes: toInt((ruRaw as any).di_boxes ?? (ruRaw as any).diBoxes),
    };
    const hasUnits = Object.values(units).some((n) => n > 0);
    const backEntries = Object.entries(backRaw || {}).filter(([_, val]) => {
      const n = Number(val);
      return Number.isFinite(n) && n > 0;
    });
    if (!hasUnits && backEntries.length === 0) return null;

    return (
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="text-xs font-semibold text-gray-900 mb-1.5">Tech &amp; backline (for sound)</div>
        <div className="grid grid-cols-1 gap-2 text-xs text-gray-800">
          {hasUnits ? (
            <div>
              <div className="font-medium text-gray-700 mb-0.5">Inputs &amp; monitoring</div>
              <ul className="list-disc list-inside space-y-0.5">
                {units.vocal_mics > 0 && (
                  <li>
                    {units.vocal_mics} vocal mic{units.vocal_mics > 1 ? 's' : ''}
                  </li>
                )}
                {units.speech_mics > 0 && (
                  <li>
                    {units.speech_mics} wireless / speech mic{units.speech_mics > 1 ? 's' : ''}
                  </li>
                )}
                {units.monitor_mixes > 0 && (
                  <li>
                    {units.monitor_mixes} monitor mix{units.monitor_mixes > 1 ? 'es' : ''}
                  </li>
                )}
                {units.iem_packs > 0 && (
                  <li>
                    {units.iem_packs} IEM pack{units.iem_packs > 1 ? 's' : ''}
                  </li>
                )}
                {units.di_boxes > 0 && (
                  <li>
                    {units.di_boxes} DI box{units.di_boxes > 1 ? 'es' : ''}
                  </li>
                )}
              </ul>
            </div>
          ) : null}
          {backEntries.length ? (
            <div>
              <div className="font-medium text-gray-700 mb-0.5">Requested backline</div>
              <ul className="list-disc list-inside space-y-0.5">
                {backEntries.map(([key, val]) => {
                  const count = Number(val);
                  if (!Number.isFinite(count) || count <= 0) return null;
                  const label = formatBacklineLabel(key);
                  return (
                    <li key={key}>
                      {count}× {label}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    );
  })();

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
    const currentArtistSlug =
      (bookingRequest as any).service_provider_profile?.slug ||
      (bookingRequest as any).artist_profile?.slug ||
      null;

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
              href={`/${currentArtistSlug || currentArtistId || ''}`}
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
        const currentArtistSlug =
          (bookingRequest as any).service_provider_profile?.slug ||
          (bookingRequest as any).artist_profile?.slug ||
          null;

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
        const showPrep = !isPersonalized && (isPaid || accepted);

        return (
          <>
            <BookingSummaryCard
              variant={isPersonalized ? 'personalizedVideo' : 'default'}
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
              // Hide event-specific rows for Personalized Video
              showTravel={!isPersonalized}
              showSound={!isPersonalized}
              showPolicy={!isPersonalized}
              showEventDetails={!isPersonalized}
              showReceiptBelowTotal={isPersonalized}
              clientReviewCta={clientReviewCta}
              belowHeader={
                isPersonalized ? (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 shadow-sm">
                    <div className="font-semibold text-indigo-900">Personalised Video</div>
                    <div className="mt-1 text-indigo-800">
                      {authLoading
                        ? 'Loading your personalised video details…'
                        : viewerIsProvider
                          ? 'Review the brief and deliver the video here when it’s ready.'
                          : viewerIsClient
                            ? 'Complete the brief so production can start right away.'
                            : 'Open the brief to continue.'}
                    </div>
                    {pvDeliveryLabel ? (
                      <div className="mt-2 text-xs text-indigo-700">
                        Delivery by <span className="font-semibold">{pvDeliveryLabel}</span>
                      </div>
                    ) : null}
                    {pvBriefLink ? (
                      <div className="mt-3">
                        <a
                          href={pvBriefLink}
                          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow transition no-underline hover:bg-indigo-700 hover:no-underline hover:text-white visited:text-white"
                        >
                          {authLoading || viewerIsProvider || !viewerIsClient || pvBriefComplete
                            ? 'View Brief'
                            : 'Complete Brief'}
                        </a>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-indigo-700">
                        We’ll drop your brief link here as soon as the order finishes syncing.
                      </div>
                    )}
                    {ENABLE_PV_ORDERS && pvOrderId ? (
                      <div className="mt-3">
                        {(() => {
                          const st = String(pvOrderStatus || '').toLowerCase();
                          const lastMsg = String((bookingRequest as any)?.last_message_content || '').toLowerCase();
                          const hintDelivered = lastMsg.includes('video has been delivered');
                          const isDelivered =
                            hintDelivered ||
                            st === 'delivered' ||
                            st === 'completed' ||
                            st === 'closed' ||
                            st === 'in_dispute' ||
                            st === 'refunded';
                          const canDeliver = viewerIsProvider && st === 'in_production';

                          if (isDelivered) {
                            return (
                              <div className="flex flex-col gap-2">
                                <div className="text-xs font-semibold text-emerald-700">Delivered</div>
                                <a
                                  href={`/video-orders/${Number(pvOrderId)}/deliver`}
                                  className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
                                >
                                  View video
                                </a>
                              </div>
                            );
                          }

                          if (canDeliver) {
                            return (
                              <a
                                href={`/video-orders/${Number(pvOrderId)}/deliver`}
                                className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-100"
                              >
                                Deliver video
                              </a>
                            );
                          }

                          return null;
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : showPrep ? (
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
                          try {
                            window.location.href = `/dashboard/events/${bidFromProp}`;
                          } catch {}
                          return;
                        }
                        const threadId = Number(bookingRequest.id) || 0;
                        if (!threadId) return;
                        // 1) Cached mapping
                        try {
                          const cached = sessionStorage.getItem(`bookingId:br:${threadId}`);
                          const bid = cached ? Number(cached) : 0;
                          if (Number.isFinite(bid) && bid > 0) {
                            try {
                              window.location.href = `/dashboard/events/${bid}`;
                            } catch {}
                            return;
                          }
                        } catch {}
                        // 2) Direct resolver
                        try {
                          const res = await getBookingIdForRequest(threadId);
                          const bid = Number((res as any)?.data?.booking_id || 0);
                          if (Number.isFinite(bid) && bid > 0) {
                            try {
                              sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid));
                            } catch {}
                            try {
                              window.location.href = `/dashboard/events/${bid}`;
                            } catch {}
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
                              try {
                                sessionStorage.setItem(`bookingId:br:${threadId}`, String(bid));
                              } catch {}
                              try {
                                window.location.href = `/dashboard/events/${bid}`;
                              } catch {}
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
            {techBacklineCard}
          </>
        );
      })()}
      {paymentModal}
    </div>
  );
}
// moved to chat folder
