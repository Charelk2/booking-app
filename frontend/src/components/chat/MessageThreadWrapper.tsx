'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SafeImage from '@/components/ui/SafeImage';

import type { Booking, BookingRequest, QuoteV2 } from '@/types';
import * as api from '@/lib/api';
import { useAuth as useContextAuth } from '@/contexts/AuthContext';
import { getFullImageUrl } from '@/lib/utils';

import MessageThread from '@/components/chat/MessageThread/index.web';
import BookingDetailsPanel from '@/components/chat/BookingDetailsPanel';
import ClientProfilePanel from '@/components/chat/MessageThread/ClientProfilePanel';
import ProviderProfilePanel from '@/components/chat/MessageThread/ProviderProfilePanel';
import usePaymentModal from '@/hooks/usePaymentModal';
import SoundInlineQuote from '@/components/chat/inlinequote/SoundInlineQuote';
import LivePerformanceInlineQuote from '@/components/chat/inlinequote/LivePerformanceInlineQuote';
import {
  createQuoteV2,
  getQuotesForBookingRequest,
  getQuoteV2,
  getBookingIdForRequest,
  getBookingRequestById,
  getBookingRequestCached,
} from '@/lib/api';
import BookingSummarySkeleton from '@/components/chat/BookingSummarySkeleton';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { counterpartyAvatar, counterpartyLabel } from '@/lib/names';
import { useQuotes, prefetchQuotesByIds } from '@/hooks/useQuotes';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';
import { resolveQuoteTotalsPreview } from '@/lib/quoteTotals';

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function getPath(obj: unknown, path: Array<string | number>): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = (cur as UnknownRecord)[String(key)];
  }
  return cur;
}

function firstNonEmptyString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (t) return t;
  }
  return null;
}

function firstFiniteNumber(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const n = typeof c === 'string' && c.trim() === '' ? NaN : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const safeStorage = {
  get(storage: Storage, key: string) {
    try { return storage.getItem(key); } catch { return null; }
  },
  set(storage: Storage, key: string, value: string) {
    try { storage.setItem(key, value); } catch {}
  },
  remove(storage: Storage, key: string) {
    try { storage.removeItem(key); } catch {}
  },
};

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

const DETAILS_CACHE_PREFIX = 'inbox:bookingDetails:v1';
const parsedDetailsCache = new Map<number, ParsedBookingDetails | null>();

const detailKeys: (keyof ParsedBookingDetails)[] = ['eventType', 'description', 'date', 'location', 'guests', 'venueType', 'soundNeeded', 'notes'];

function normalizeDetails(details: ParsedBookingDetails | null | undefined): ParsedBookingDetails | null {
  if (!details) return null;
  const normalized: ParsedBookingDetails = {};
  detailKeys.forEach((key) => {
    const value = details[key];
    if (value == null) return;
    const trimmed = String(value).trim();
    if (trimmed.length > 0) normalized[key] = trimmed;
  });
  return Object.keys(normalized).length ? normalized : null;
}

function detailsCacheKey(id: number) {
  return `${DETAILS_CACHE_PREFIX}:${id}`;
}

function readCachedDetails(id: number): ParsedBookingDetails | null {
  if (parsedDetailsCache.has(id)) return parsedDetailsCache.get(id) ?? null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(detailsCacheKey(id));
    if (raw) {
      const parsed = normalizeDetails(JSON.parse(raw));
      parsedDetailsCache.set(id, parsed);
      return parsed;
    }
  } catch {}
  parsedDetailsCache.set(id, null);
  return null;
}

function writeCachedDetails(id: number, details: ParsedBookingDetails | null) {
  const normalized = normalizeDetails(details);
  parsedDetailsCache.set(id, normalized);
  if (typeof window === 'undefined') return;
  const key = detailsCacheKey(id);
  try {
    if (normalized) sessionStorage.setItem(key, JSON.stringify(normalized));
    else sessionStorage.removeItem(key);
  } catch {}
}

function mergeDetails(base: ParsedBookingDetails | null, incoming: ParsedBookingDetails | null): ParsedBookingDetails | null {
  const normalizedIncoming = normalizeDetails(incoming);
  if (!normalizedIncoming) return normalizeDetails(base);
  const normalizedBase = normalizeDetails(base) ?? {};
  const merged: ParsedBookingDetails = { ...normalizedBase };
  detailKeys.forEach((key) => {
    if (!merged[key] && normalizedIncoming[key]) merged[key] = normalizedIncoming[key];
  });
  return Object.keys(merged).length ? merged : null;
}

function detailsEqual(a: ParsedBookingDetails | null, b: ParsedBookingDetails | null) {
  return detailKeys.every((key) => (a ?? {})[key] === (b ?? {})[key]);
}

function useRestoreFocusWhenClosed(open: boolean) {
  const lastFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (open) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      return;
    }

    const el = lastFocusRef.current;
    lastFocusRef.current = null;
    try { el?.focus?.(); } catch {}
  }, [open]);
}

function useEscToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);
}

interface MessageThreadWrapperProps {
  bookingRequestId: number | null;
  bookingRequest: BookingRequest | null;
  setShowReviewModal: (show: boolean) => void;
  isActive?: boolean;
}

export default function MessageThreadWrapper({
  bookingRequestId,
  bookingRequest,
  setShowReviewModal,
  isActive = true,
}: MessageThreadWrapperProps) {
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState<Booking | null>(null);
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [autoOpenClientReview, setAutoOpenClientReview] = useState(false);
  const [showProviderProfile, setShowProviderProfile] = useState(false);
  const [autoOpenProviderReview, setAutoOpenProviderReview] = useState(false);

  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);

  const [parsedDetails, setParsedDetails] = useState<ParsedBookingDetails | null>(() => {
    if (!bookingRequestId) return null;
    return readCachedDetails(bookingRequestId) ?? null;
  });
  const [presenceHeader, setPresenceHeader] = useState<string>('');

  const { user } = useContextAuth();
  const router = useRouter();

  useEffect(() => {
    if (!bookingRequestId) {
      setParsedDetails(null);
      return;
    }
    const cached = readCachedDetails(bookingRequestId);
    setParsedDetails((prev) => (detailsEqual(prev, cached) ? prev : cached));
  }, [bookingRequestId]);

  const handleParsedDetails = useCallback((details: ParsedBookingDetails | null) => {
    if (!bookingRequestId) return;
    const normalized = normalizeDetails(details);
    writeCachedDetails(bookingRequestId, normalized);
    setParsedDetails(normalized);
  }, [bookingRequestId]);

  const handleFallbackDetails = useCallback((details: ParsedBookingDetails | null) => {
    if (!bookingRequestId || !details) return;
    setParsedDetails((prev) => {
      const base = prev ?? readCachedDetails(bookingRequestId);
      const merged = mergeDetails(base, details);
      if (detailsEqual(base, merged)) return prev ?? base ?? null;
      writeCachedDetails(bookingRequestId, merged);
      return merged;
    });
  }, [bookingRequestId]);

  const [isUserArtist, setIsUserArtist] = useState(false);
  useEffect(() => {
    // Legacy flag retained for backward compatibility; thread-scoped roles
    // (isThreadProvider / isThreadClient) should be preferred for new logic.
    setIsUserArtist(Boolean(user && user.user_type === 'service_provider'));
  }, [user]);

  useEffect(() => {
    if (!bookingRequestId || typeof window === 'undefined') return;
    if (!receiptUrl) {
      const cachedUrl = safeStorage.get(window.localStorage, `receipt_url:br:${bookingRequestId}`);
      if (cachedUrl) setReceiptUrl(cachedUrl);
    }
    if (!paymentReference) {
      const cachedRef = safeStorage.get(window.localStorage, `receipt_ref:br:${bookingRequestId}`);
      if (cachedRef) setPaymentReference(cachedRef);
    }
  }, [bookingRequestId, receiptUrl, paymentReference]);

  useEffect(() => {
    if (!bookingRequest) return;
    const br: unknown = bookingRequest;

    if (!paymentStatus) {
      const status = firstNonEmptyString(
        getPath(br, ['payment_status']),
        getPath(br, ['latest_payment_status']),
        getPath(br, ['booking', 'payment_status']),
      );
      if (status) setPaymentStatus(status);
    }

    if (paymentAmount == null) {
      const amount = firstFiniteNumber(
        getPath(br, ['payment_amount']),
        getPath(br, ['latest_payment_amount']),
        getPath(br, ['booking', 'payment_amount']),
      );
      if (amount != null) setPaymentAmount(amount);
    }

    if (!receiptUrl) {
      const raw = firstNonEmptyString(
        getPath(br, ['receipt_url']),
        getPath(br, ['payment_receipt_url']),
        getPath(br, ['latest_receipt_url']),
        getPath(br, ['booking', 'receipt_url']),
      );
      if (raw) {
        const absolute = /^https?:\/\//i.test(raw) ? raw : api.apiUrl(raw);
        setReceiptUrl(absolute);
        if (bookingRequestId && typeof window !== 'undefined') {
          safeStorage.set(window.localStorage, `receipt_url:br:${bookingRequestId}`, absolute);
        }
      }
    }

    if (!paymentReference) {
      const ref = firstNonEmptyString(
        getPath(br, ['payment_reference']),
        getPath(br, ['latest_payment_reference']),
        getPath(br, ['payment_id']),
        getPath(br, ['booking', 'payment_reference']),
        getPath(br, ['booking', 'payment_id']),
      );
      if (ref) {
        setPaymentReference(ref);
        if (bookingRequestId && typeof window !== 'undefined') {
          safeStorage.set(window.localStorage, `receipt_ref:br:${bookingRequestId}`, ref);
        }
      }
    }
  }, [bookingRequest, paymentStatus, paymentAmount, receiptUrl, paymentReference, bookingRequestId]);

  /** Mobile details sheet visibility (defaults open on desktop widths) */
  const [showSidePanel, setShowSidePanel] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [bookingRequestFull, setBookingRequestFull] = useState<BookingRequest | null>(null);

  useRestoreFocusWhenClosed(showQuoteModal);
  useRestoreFocusWhenClosed(showDetailsModal);
  useRestoreFocusWhenClosed(showClientProfile);
  useRestoreFocusWhenClosed(showProviderProfile);
  useRestoreFocusWhenClosed(showSidePanel);

  useEscToClose(showQuoteModal, () => setShowQuoteModal(false));
  useEscToClose(showDetailsModal, () => setShowDetailsModal(false));
  useEscToClose(showClientProfile, () => setShowClientProfile(false));
  useEscToClose(showProviderProfile, () => setShowProviderProfile(false));
  useEscToClose(showSidePanel, () => setShowSidePanel(false));

  useEffect(() => {
    let cancelled = false;
    if (!bookingRequestId) {
      setBookingRequestFull(null);
      return;
    }
    (async () => {
      try {
        const data = await api.getBookingRequestCached(Number(bookingRequestId));
        if (cancelled) return;
        setBookingRequestFull(data as any);
      } catch {
        if (cancelled) return;
        setBookingRequestFull(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingRequestId]);

  const effectiveBookingRequest = useMemo(() => {
    return (bookingRequestFull || bookingRequest || null) as BookingRequest | null;
  }, [bookingRequestFull, bookingRequest]);

  const providerProfile = useMemo(() => {
    const base: any = effectiveBookingRequest;
    if (!base) return null;
    return base.service_provider_profile ?? null;
  }, [effectiveBookingRequest]);

  const providerVatRegistered = Boolean(providerProfile?.vat_registered);
  const providerVatRate = useMemo(() => {
    if (!providerVatRegistered) return null;
    const raw = providerProfile?.vat_rate;
    if (raw == null) return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }, [providerProfile, providerVatRegistered]);

  /** Quotes for totals in the side panel */
  const initialQuotes = useMemo(() => {
    if (!bookingRequest) return [] as QuoteV2[];
    const arr = Array.isArray((bookingRequest as any)?.quotes) ? (bookingRequest as any).quotes : [];
    const normalized: QuoteV2[] = [];
      const seen = new Set<number>();
      for (const raw of arr) {
        if (!raw) continue;
        if (!Array.isArray((raw as any)?.services)) continue;
        const q = raw as QuoteV2;
        const qid = Number(q?.id || 0);
        if (!q || !Number.isFinite(qid) || seen.has(qid)) continue;
        seen.add(qid);
        const bookingId = Number(q?.booking_request_id ?? bookingRequest?.id ?? bookingRequestId ?? 0) || Number(bookingRequestId || 0);
        normalized.push({ ...q, booking_request_id: bookingId } as QuoteV2);
      }
      return normalized;
  }, [bookingRequest]);

  const { quotesById, ensureQuotesLoaded, setQuote } = useQuotes(Number(bookingRequestId || 0), initialQuotes);
  const [quotesLoading, setQuotesLoading] = useState(initialQuotes.length === 0);
  const canonicalHydrateAttemptedRef = useRef(false);
  const historyFetchTriggeredRef = useRef(false);

  useEffect(() => {
    setQuotesLoading(initialQuotes.length === 0);
  }, [initialQuotes]);

  useEffect(() => {
    canonicalHydrateAttemptedRef.current = false;
    historyFetchTriggeredRef.current = false;
  }, [bookingRequestId]);

  const refreshQuotesForThread = useCallback(async () => {
    try {
      const ids: number[] = [];
      const accepted = Number((bookingRequest as any)?.accepted_quote_id || 0);
      if (Number.isFinite(accepted) && accepted > 0) ids.push(accepted);
      try {
        const arr = Array.isArray((bookingRequest as any)?.quotes) ? (bookingRequest as any).quotes : [];
        for (const q of arr) {
          const id = Number((q as any)?.id || 0);
          if (Number.isFinite(id) && id > 0) ids.push(id);
        }
      } catch {}
      const unique = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
      if (!unique.length) return;
      try { await prefetchQuotesByIds(unique); } catch {}
      try { await ensureQuotesLoaded(unique); } catch {}
    } catch { /* ignore */ }
  }, [bookingRequest, bookingRequestId, ensureQuotesLoaded]);

  const handleHydratedBookingRequest = useCallback((request: BookingRequest) => {
    canonicalHydrateAttemptedRef.current = true;
    let seededQuotes = false;
    try {
      const arr = Array.isArray((request as any)?.quotes) ? (request as any).quotes : [];
      const normalized: QuoteV2[] = [];
      const seen = new Set<number>();
      for (const raw of arr) {
        if (!raw) continue;
        if (!Array.isArray((raw as any)?.services)) continue;
        const q = raw as QuoteV2;
        const qid = Number(q?.id || 0);
        if (!q || !Number.isFinite(qid) || seen.has(qid)) continue;
        seen.add(qid);
        const bookingId = Number(q?.booking_request_id ?? request.id ?? bookingRequestId ?? 0) || Number(bookingRequestId || 0);
        normalized.push({ ...q, booking_request_id: bookingId } as QuoteV2);
      }
      if (normalized.length) {
        normalized.forEach((q) => setQuote(q));
        seededQuotes = true;
        setQuotesLoading(false);
      }
    } catch {
      // ignore enrich failures
    }

    const acceptedId = Number((request as any)?.accepted_quote_id || 0);
    const rawQuotesCount = Array.isArray((request as any)?.quotes) ? (request as any).quotes.length : 0;
    if (!seededQuotes && (acceptedId > 0 || rawQuotesCount > 0)) {
      setQuotesLoading(true);
      (async () => {
        try {
          await refreshQuotesForThread();
        } finally {
          setQuotesLoading(false);
        }
      })();
    } else if (!seededQuotes) {
      setQuotesLoading(false);
    }

    try {
      const detailsMessage = (request as any)?.booking_details_message;
      if (typeof detailsMessage === 'string' && detailsMessage.trim().length) {
        const text = detailsMessage.trim();
        if (text.startsWith(BOOKING_DETAILS_PREFIX) || text.includes(BOOKING_DETAILS_PREFIX)) {
          const parsed = parseBookingDetailsFromMessage(text);
          if (Object.keys(parsed).length) {
            handleParsedDetails(parsed);
          }
        }
      }
    } catch {
      // ignore parse errors; fallback fetch covers it
    }

    try {
      const eventType = (request as any)?.event_type || (request as any)?.event?.event_type;
      const guests = (request as any)?.guests_count;
      const soundContext = (request as any)?.sound_context;
      const locationName =
        (request as any)?.event_location_name ||
        (request as any)?.venue_name ||
        null;
      const location =
        (request as any)?.event_location ||
        (request as any)?.location ||
        (request as any)?.event_address ||
        (request as any)?.venue_address ||
        null;
      const city = (request as any)?.event_city || (request as any)?.city || null;
      const region = (request as any)?.event_region || (request as any)?.event_province || (request as any)?.province || null;
      const proposedDate =
        (request as any)?.proposed_datetime_1 ||
        (request as any)?.event_date ||
        (request as any)?.proposed_datetime_2 ||
        null;
      const rawSoundNeeded =
        (request as any)?.sound_needed ??
        (request as any)?.sound_required ??
        (soundContext ? soundContext.sound_required : undefined);
      const fallback: ParsedBookingDetails = {};
      if (eventType) fallback.eventType = String(eventType);
      if (location) {
        fallback.location = String(location);
      } else if (city || region) {
        fallback.location = [city, region].filter(Boolean).map((part) => String(part).trim()).filter(Boolean).join(', ');
      }
      if (locationName) {
        (fallback as any).location_name = String(locationName);
      }
      if (Number.isFinite(guests)) fallback.guests = String(guests);
      else if (typeof guests === 'string' && guests.trim().length) fallback.guests = guests.trim();
      if (typeof rawSoundNeeded === 'string' && rawSoundNeeded.trim().length) {
        fallback.soundNeeded = String(rawSoundNeeded);
      } else if (typeof rawSoundNeeded === 'boolean') {
        fallback.soundNeeded = rawSoundNeeded ? 'Yes' : 'No';
      } else if (soundContext?.mode && typeof soundContext.mode === 'string' && soundContext.mode !== 'none') {
        fallback.soundNeeded = 'Yes';
      }
      if (typeof proposedDate === 'string' && proposedDate.trim().length) {
        fallback.date = proposedDate.trim();
      }
      if (Object.keys(fallback).length) {
        handleFallbackDetails(fallback);
      }
    } catch {
      // ignore fallback merge issues
    }
  }, [bookingRequestId, refreshQuotesForThread, handleFallbackDetails, handleParsedDetails, setQuote]);
  useEffect(() => {
    const ids: number[] = [];
    try {
      const arr = Array.isArray((bookingRequest as any)?.quotes) ? (bookingRequest as any).quotes : [];
      for (const q of arr) {
        const id = Number((q as any)?.id || 0);
        if (Number.isFinite(id) && id > 0) ids.push(id);
      }
      const accepted = Number((bookingRequest as any)?.accepted_quote_id || 0);
      if (Number.isFinite(accepted) && accepted > 0) ids.push(accepted);
    } catch {}
    if (!ids.length) {
      if (Number(bookingRequestId || 0) > 0 && initialQuotes.length === 0) {
        setQuotesLoading(true);
        (async () => {
          try { await refreshQuotesForThread(); }
          finally { setQuotesLoading(false); }
        })();
      } else {
        setQuotesLoading(false);
      }
      return;
    }
    // Prefetch to global cache for fast subsequent loads, then ensure this
    // component's local state is hydrated so the side panel totals render.
    (async () => {
      const shouldShowLoading = !initialQuotes.length;
      if (shouldShowLoading) setQuotesLoading(true);
      try { await prefetchQuotesByIds(ids); } catch {}
      try { await ensureQuotesLoaded(ids); } catch {}
      finally {
        if (shouldShowLoading) setQuotesLoading(false);
      }
    })();
  }, [bookingRequest, ensureQuotesLoaded, initialQuotes.length, refreshQuotesForThread, bookingRequestId]);

  useEffect(() => {
    if (Object.keys(quotesById).length) setQuotesLoading(false);
  }, [quotesById]);

  useEffect(() => {
    if (!bookingRequestId) return;
    if (!canonicalHydrateAttemptedRef.current) return;
    if (historyFetchTriggeredRef.current) return;
    const normalized = normalizeDetails(parsedDetails);
    const needHistoricalScan =
      !normalized ||
      detailKeys.every((key) => {
        const value = normalized?.[key];
        return value == null || String(value).trim().length === 0;
      });
    if (!needHistoricalScan) return;
    historyFetchTriggeredRef.current = true;
    (async () => {
      let cursor: number | null = null;
      for (let attempts = 0; attempts < 3; attempts += 1) {
        try {
          const params: any = { limit: 400, mode: 'full' as const };
          if (Number.isFinite(cursor) && cursor != null && cursor > 0) {
            params.before_id = cursor;
          }
          const res = await api.getMessagesForBookingRequest(Number(bookingRequestId), params as any);
          const payload: any = res?.data ?? {};
          const rows = Array.isArray(payload.items)
            ? payload.items
            : Array.isArray(payload.messages)
              ? payload.messages
              : Array.isArray(payload)
                ? payload
                : [];
          if (!rows.length && !payload.has_more) break;
          let found = false;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const row = rows[i];
            const type = String((row as any)?.message_type || '').toUpperCase();
            if (type !== 'SYSTEM') continue;
            const content = String((row as any)?.content || '').trim();
            if (!content.startsWith(BOOKING_DETAILS_PREFIX)) continue;
            const parsed = parseBookingDetailsFromMessage(content);
            if (Object.keys(parsed).length) {
              handleParsedDetails(parsed);
              handleFallbackDetails(parsed);
              found = true;
              break;
            }
          }
          if (found) break;
          const ids = rows
            .map((row: any) => Number((row as any)?.id || 0))
            .filter((id: number) => Number.isFinite(id) && id > 0);
          if (!payload.has_more || !ids.length) break;
          cursor = Math.min(...ids);
        } catch (err: any) {
          const status = Number(err?.response?.status ?? err?.status ?? 0);
          if (status === 403) {
            try { window.dispatchEvent(new CustomEvent('thread:missing', { detail: { id: bookingRequestId } })); } catch {}
            return;
          }
          break;
        }
      }
    })();
  }, [bookingRequestId, parsedDetails, handleFallbackDetails, handleParsedDetails]);

  /** Payment modal */
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(async ({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status ?? null);
      setPaymentAmount(amount ?? null);
      setReceiptUrl(url ?? null);
      // Refresh quotes and proactively hydrate booking_id for the accepted quote
      try {
        await refreshQuotesForThread();
        if (!bookingRequestId) return;
        // First, attempt a direct booking-id resolve for this thread
        try {
          const res = await getBookingIdForRequest(Number(bookingRequestId));
          const bid = Number((res.data as any)?.booking_id || 0);
          if (Number.isFinite(bid) && bid > 0) {
            try { sessionStorage.setItem(`bookingId:br:${bookingRequestId}`, String(bid)); } catch {}
            // We can stop here; no need to find accepted quote
            return;
          }
        } catch {}
        // Prefer a single booking request read to find accepted quote id
        try {
          let prevEtag: string | null = null;
          try { if (typeof window !== 'undefined') prevEtag = sessionStorage.getItem(`br:etag:${bookingRequestId}`); } catch {}
          const r = await getBookingRequestById(Number(bookingRequestId || 0), prevEtag || undefined);
          const status = Number((r as any)?.status ?? 200);
          if (status === 304) {
            // No change; nothing to resolve here
            return;
          }
          try {
            const newTag = (r as any)?.headers?.etag || (r as any)?.headers?.ETag;
            if (newTag && typeof window !== 'undefined') sessionStorage.setItem(`br:etag:${bookingRequestId}`, String(newTag));
          } catch {}
          const acceptedId = Number((r.data as any)?.accepted_quote_id || 0);
          if (Number.isFinite(acceptedId) && acceptedId > 0) {
            try {
              const v2 = await getQuoteV2(acceptedId);
              const bid = Number((v2.data as any)?.booking_id || 0);
              if (Number.isFinite(bid) && bid > 0) {
                try { sessionStorage.setItem(`bookingId:br:${bookingRequestId}`, String(bid)); } catch {}
              }
            } catch {}
          }
        } catch {}
      } catch {}
    }, [refreshQuotesForThread]),
    useCallback(() => {}, []),
  );

  /** Back button closes the sheet first (mobile) */
  const pushedSheetStateRef = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      if (showSidePanel) {
        setShowSidePanel(false);
        return;
      }
      router.back();
    };

    window.addEventListener('popstate', handlePopState);

    if (showSidePanel && !pushedSheetStateRef.current) {
      try {
        window.history.pushState({ inboxSheet: true }, '');
        pushedSheetStateRef.current = true;
      } catch {
        // ignore
      }
    }

    if (!showSidePanel) {
      pushedSheetStateRef.current = false;
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSidePanel, router]);

  /** Lock background scroll while any overlay is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (showSidePanel || showQuoteModal || showDetailsModal || showClientProfile) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = prev || '';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [showSidePanel, showQuoteModal, showDetailsModal, showClientProfile]);

  const handleDownloadCalendar = useCallback(async () => {
    if (!confirmedBookingDetails?.id) return;
    try {
      const res = await api.downloadBookingIcs(confirmedBookingDetails.id);
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `booking-${confirmedBookingDetails.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Calendar download error:', err);
    }
  }, [confirmedBookingDetails]);

  if (!bookingRequestId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
        <p>Select a conversation to view messages.</p>
      </div>
    );
  }

  // Detect Booka moderation system message
  const isBookaModeration = (() => {
    const text = (effectiveBookingRequest?.last_message_content || '').toString();
    const synthetic = Boolean((effectiveBookingRequest as any)?.is_booka_synthetic);
    const label = (effectiveBookingRequest as any)?.counterparty_label || '';
    return synthetic || label === 'Booka' || /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
  })();

  // Thread-scoped roles: who is the client vs provider for THIS booking request,
  // regardless of the account's global user_type.
  const threadClientId = useMemo(() => {
    try {
      const raw: any = effectiveBookingRequest;
      const cid = Number(raw?.client_id || 0);
      return Number.isFinite(cid) && cid > 0 ? cid : 0;
    } catch {
      return 0;
    }
  }, [effectiveBookingRequest]);

  const threadProviderId = useMemo(() => {
    try {
      const raw: any = effectiveBookingRequest;
      const aid = Number(
        raw?.service_provider_id ||
        raw?.artist_id ||
        raw?.artist?.id ||
        raw?.artist_profile?.user_id ||
        0,
      );
      return Number.isFinite(aid) && aid > 0 ? aid : 0;
    } catch {
      return 0;
    }
  }, [effectiveBookingRequest]);

  const isThreadClient = Boolean(user && threadClientId && user.id === threadClientId);
  const isThreadProvider = Boolean(user && threadProviderId && user.id === threadProviderId);

  const effectiveClientId = useMemo(() => {
    try {
      const raw = (effectiveBookingRequest as any) || {};
      const cid = Number(raw?.client_id || 0);
      return Number.isFinite(cid) && cid > 0 ? cid : 0;
    } catch {
      return 0;
    }
  }, [effectiveBookingRequest]);

  const canProviderReviewClient = useMemo(() => {
    return Boolean(isThreadProvider && effectiveClientId);
  }, [isThreadProvider, effectiveClientId]);

  const providerIdForProfile = useMemo(() => {
    try {
      const raw = (effectiveBookingRequest as any) || {};
      return (
        Number(raw?.service_provider_id) ||
        Number(raw?.artist_id) ||
        Number(raw?.artist?.id) ||
        Number(raw?.artist_profile?.user_id) ||
        Number(raw?.service?.service_provider_id) ||
        Number(raw?.service?.artist_id) ||
        Number(raw?.service?.artist?.user_id) ||
        0
      );
    } catch {
      return 0;
    }
  }, [effectiveBookingRequest]);

  const providerBusinessName = useMemo(() => {
    const raw: any = effectiveBookingRequest;
    if (!raw) return null;
    const providerProfile = raw.service_provider_profile || raw.artist_profile || null;
    const nameCandidates = [
      providerProfile?.business_name,
      raw?.service?.service_provider_profile?.business_name,
      raw?.service?.artist_profile?.business_name,
      raw?.service?.service_provider?.business_name,
      raw?.service?.artist?.business_name,
    ];
    for (const candidate of nameCandidates) {
      if (!candidate) continue;
      const trimmed = String(candidate).trim();
      if (trimmed) return trimmed;
    }
    return null;
  }, [effectiveBookingRequest]);

  const isChildThread = useMemo(() => {
    const raw: any = effectiveBookingRequest;
    if (!raw) return false;
    const parentId = Number(raw.parent_booking_request_id || 0);
    return Number.isFinite(parentId) && parentId > 0;
  }, [effectiveBookingRequest]);

  const isSoundThread = useMemo(() => {
    const raw: any = effectiveBookingRequest;
    if (!raw) return false;
    const svc = raw.service || {};
    const slug = String(svc.service_category_slug || '').toLowerCase();
    const catName = String(svc.service_category?.name || '').toLowerCase();
    const ctx = (raw.travel_breakdown || raw.sound_context || {}) as any;
    const soundMode = String(ctx?.sound_mode || '').toLowerCase();
    const isSoundCategory = slug.includes('sound') || catName.includes('sound');
    if (isSoundCategory) return true;

    // Treat supplier-mode as a sound thread only for child
    // bookings (sound-provider threads). For the main artist
    // thread, supplier-mode means "sound will be handled by a
    // separate provider", but the quote engine must stay live.
    const parentId = Number(raw.parent_booking_request_id || 0);
    const isChild = Number.isFinite(parentId) && parentId > 0;
    if (isChild && soundMode === 'supplier') return true;
    return false;
  }, [effectiveBookingRequest]);

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Unified header */}
      <header className="sticky top-0 z-10 bg-white text-gray-900 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between border-b border-gray-200 md:min-h-[64px]">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {effectiveBookingRequest ? (
            isBookaModeration ? (
              <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center text-base font-medium" aria-label="Booka system">
                B
              </div>
            ) : (() => {
              const raw: any = effectiveBookingRequest;
              const viewer = user ?? undefined;
              const viewerRole = isThreadProvider ? 'provider' : isThreadClient ? 'client' : undefined;

              // When we are the provider for this thread, show the client avatar.
              if (isThreadProvider) {
                const src =
                  (raw?.client?.profile_picture_url as string | undefined) ||
                  (raw?.counterparty_avatar_url as string | undefined) ||
                  null;
                if (src) {
                  return (
                    <SafeImage
                      src={src}
                      alt="Client avatar"
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 rounded-full object-cover"
                      sizes="40px"
                    />
                  );
                }
              }

              // When we are the client for this thread, show the provider avatar (link to profile when possible).
              if (isThreadClient) {
                const hrefSlug =
                  raw?.service_provider_profile?.slug ||
                  raw?.artist_profile?.slug ||
                  raw?.service_provider_id ||
                  raw?.artist_id ||
                  raw?.artist?.id ||
                  raw?.artist_profile?.user_id ||
                  raw?.service?.service_provider_id ||
                  raw?.service?.artist_id ||
                  raw?.service?.artist?.user_id ||
                  '';
                const src =
                  (raw?.service_provider_profile?.profile_picture_url as string | undefined) ||
                  (raw?.artist_profile?.profile_picture_url as string | undefined) ||
                  (raw?.counterparty_avatar_url as string | undefined) ||
                  null;
                if (src) {
                  const img = (
                    <SafeImage
                      src={src}
                      alt="Service Provider avatar"
                      width={40}
                      height={40}
                      loading="lazy"
                      className="h-10 w-10 rounded-full object-cover"
                      sizes="40px"
                    />
                  );
                  return hrefSlug ? (
                    <Link href={`/${hrefSlug}`} aria-label="Service Provider profile" className="flex-shrink-0">
                      {img}
                    </Link>
                  ) : (
                    img
                  );
                }
              }

              // Fallback: use counterparty label initial so we avoid empty avatars.
              const label = counterpartyLabel(
                raw,
                viewer,
                (raw?.counterparty_label as string | undefined) || 'U',
                viewerRole ? { viewerRole } : undefined,
              );
              return (
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base font-medium text-gray-600" aria-hidden>
                  {(label || 'U').charAt(0)}
                </div>
              );
            })()
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200" aria-hidden />
          )}

          {/* Name + presence */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
                {effectiveBookingRequest
                  ? (isBookaModeration
                      ? 'Booka'
                      : (() => {
                          const roleHint = isThreadProvider ? 'provider' : isThreadClient ? 'client' : undefined;
                          // When we are the provider for this thread and the
                          // client is a BSP/service provider, prefer their
                          // business name so providers see the brand (e.g.,
                          // Sound Solutions) instead of a personal name.
                          if (isThreadProvider) {
                            try {
                              const raw: any = effectiveBookingRequest;
                              const client: any = raw?.client || {};
                              const business =
                                client?.artist_profile?.business_name ||
                                client?.service_provider_profile?.business_name ||
                                client?.business_name;
                              if (business && String(business).trim()) {
                                return String(business).trim();
                              }
                            } catch {
                              // fall through to generic counterpartyLabel
                            }
                          }
                          return (
                            counterpartyLabel(
                              effectiveBookingRequest as any,
                              user ?? undefined,
                              (effectiveBookingRequest as any)?.counterparty_label || 'User',
                              roleHint ? { viewerRole: roleHint } : undefined,
                            ) || 'User'
                          );
                        })())
                  : 'Messages'}
              </span>
              {effectiveBookingRequest && !isBookaModeration && (
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 whitespace-nowrap">
                  {isChildThread ? 'Sound booking' : 'Artist booking'}
                </span>
              )}
            </div>
            {presenceHeader && !isBookaModeration ? (
              <span className="text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis -mt-0.5">
                {presenceHeader}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-2 sm:px-4">
          {isThreadProvider && effectiveClientId ? (
            <button
              type="button"
              onClick={() => {
                setAutoOpenClientReview(false);
                setShowClientProfile(true);
              }}
              className="hidden sm:inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              View client profile
            </button>
          ) : null}
          {isThreadClient && providerIdForProfile ? (
            <button
              type="button"
              onClick={() => {
                setAutoOpenProviderReview(false);
                setShowProviderProfile(true);
              }}
              className="hidden sm:inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              View provider profile
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowSidePanel((s) => !s)}
            aria-label={showSidePanel ? 'Hide details panel' : 'Show booking details'}
            className="px-3 py-1.5 border bg-gray-50 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <span className="text-sm font-medium text-gray-900">
              {showSidePanel ? 'Hide details' : 'Show details'}
            </span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row relative w-full">
        <div
          data-testid="thread-container"
          className={`flex-1 min-w-0 min-h-0 w-full transition-[width] duration-300 ease-in-out ${
            showSidePanel ? 'md:w-[calc(100%-300px)] lg:w-[calc(100%-360px)]' : 'md:w-full'
          }`}
        >
          <MessageThread
            bookingRequestId={bookingRequestId}
            initialBookingRequest={effectiveBookingRequest}
            isActive={isActive}
            isSoundThread={isSoundThread}
            canCreateQuote={isThreadProvider}
            serviceId={effectiveBookingRequest?.service_id ?? undefined}
            clientName={(() => {
              if (isThreadProvider) {
                return (
                  counterpartyLabel(
                    effectiveBookingRequest as any,
                    user ?? undefined,
                    (effectiveBookingRequest as any)?.counterparty_label || 'Client',
                    { viewerRole: 'provider' },
                  ) || 'Client'
                );
              }
              if (isThreadClient) {
                const first = user?.first_name || '';
                const last = user?.last_name || '';
                const full = `${first} ${last}`.trim();
                return full || 'Client';
              }
              return (
                counterpartyLabel(
                  effectiveBookingRequest as any,
                  user ?? undefined,
                  (effectiveBookingRequest as any)?.counterparty_label || 'Client',
                ) || 'Client'
              );
            })()}
            artistName={(() => {
              const raw: any = effectiveBookingRequest;
              if (isThreadProvider) {
                return (
                  raw?.artist_profile?.business_name ||
                  raw?.service_provider_profile?.business_name ||
                  raw?.artist?.business_name ||
                  raw?.artist?.first_name ||
                  'Service Provider'
                );
              }
              if (isThreadClient) {
                return (
                  counterpartyLabel(
                    raw,
                    user ?? undefined,
                    (raw?.counterparty_label as string | undefined) || 'Service Provider',
                    { viewerRole: 'client' },
                  ) || 'Service Provider'
                );
              }
              return (
                counterpartyLabel(
                  raw,
                  user ?? undefined,
                  (raw?.counterparty_label as string | undefined) || 'Service Provider',
                ) || 'Service Provider'
              );
            })()}
            artistAvatarUrl={(() => {
              const raw: any = effectiveBookingRequest;
              if (!raw) return undefined;
              if (isThreadClient) {
                return (
                  (raw.artist_profile?.profile_picture_url as string | undefined) ||
                  (raw.service_provider_profile?.profile_picture_url as string | undefined) ||
                  (raw.counterparty_avatar_url as string | undefined) ||
                  undefined
                );
              }
              if (isThreadProvider) {
                return (raw.artist_profile?.profile_picture_url as string | undefined) || undefined;
              }
              return (
                (raw.artist_profile?.profile_picture_url as string | undefined) ||
                (raw.counterparty_avatar_url as string | undefined) ||
                undefined
              );
            })()}
            clientAvatarUrl={(() => {
              const raw: any = effectiveBookingRequest;
              if (!raw) return undefined;
              if (isThreadProvider) {
                return (
                  (raw.client?.profile_picture_url as string | undefined) ||
                  (raw.counterparty_avatar_url as string | undefined) ||
                  undefined
                );
              }
              return (raw.client?.profile_picture_url as string | undefined) || undefined;
            })()}
            clientId={effectiveClientId || undefined}
            serviceName={effectiveBookingRequest?.service?.title}
            initialNotes={effectiveBookingRequest?.message ?? null}
            artistCancellationPolicy={effectiveBookingRequest?.artist_profile?.cancellation_policy ?? null}
            initialBaseFee={effectiveBookingRequest?.service?.price ? Number(effectiveBookingRequest.service.price) : undefined}
            initialTravelCost={effectiveBookingRequest && effectiveBookingRequest.travel_cost !== null && effectiveBookingRequest.travel_cost !== undefined ? Number(effectiveBookingRequest.travel_cost) : undefined}
            initialSoundNeeded={parsedDetails?.soundNeeded?.toLowerCase() === 'yes'}
            onBookingDetailsParsed={handleParsedDetails}
            onBookingConfirmedChange={(confirmed: boolean, booking: any) => {
              setBookingConfirmed(confirmed);
              setConfirmedBookingDetails(booking);
            }}
            onPaymentStatusChange={(status: string | null, amount?: number | null, url?: string | null, reference?: string | null) => {
              setPaymentStatus(status ?? null);
              setPaymentAmount(amount ?? null);
              setReceiptUrl(url ?? null);
              if (url) {
                try {
                  if (typeof window !== 'undefined' && bookingRequestId) {
                    window.localStorage.setItem(`receipt_url:br:${bookingRequestId}`, url);
                  }
                } catch {}
              }
              if (reference) {
                setPaymentReference(reference);
                try {
                  if (typeof window !== 'undefined' && bookingRequestId) {
                    window.localStorage.setItem(`receipt_ref:br:${bookingRequestId}`, reference);
                  }
                } catch {}
              }
            }}
            onShowReviewModal={setShowReviewModal}
            onOpenProviderReviewFromSystem={() => {
              setAutoOpenClientReview(true);
              setShowClientProfile(true);
            }}
            onOpenDetailsPanel={() => setShowDetailsModal((s) => !s)}
            onOpenQuote={() => setShowQuoteModal(true)}
            onPayNow={(quote: any) => {
              try {
                // All fee/VAT math is computed on the backend. If previews are missing,
                // we pass 0 so the modal can show a placeholder while the server resolves.
                const previewTotals = resolveQuoteTotalsPreview(quote);
                const amount = typeof previewTotals.clientTotalInclVat === 'number'
                  ? previewTotals.clientTotalInclVat
                  : 0;
                const provider = bookingRequest?.artist_profile?.business_name || (bookingRequest as any)?.artist?.first_name || 'Service Provider';
                const serviceName = bookingRequest?.service?.title || undefined;
                openPaymentModal({
                  bookingRequestId,
                  amount,
                  providerName: String(provider),
                  serviceName: serviceName as any,
                  customerEmail: (user as any)?.email || undefined,
                } as any);
              } catch {}
            }}
            onContinueEventPrep={async (threadId: number) => {
              try {
                const key = `bookingId:br:${threadId}`;
                // 1) Use cached booking id if available
                try {
                  const cached = sessionStorage.getItem(key);
                  const bid = cached ? Number(cached) : 0;
                  if (Number.isFinite(bid) && bid > 0) {
                    try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                    return;
                  }
                } catch {}
                // 2) Try direct resolver endpoint (fast path)
                try {
                  const res = await getBookingIdForRequest(Number(threadId));
                  const bid = Number((res.data as any)?.booking_id || 0);
                  if (Number.isFinite(bid) && bid > 0) {
                    try { sessionStorage.setItem(key, String(bid)); } catch {}
                    try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                    return;
                  }
                } catch {}
                // 3) Find accepted quote from local cache or fetch list
                const values = Object.values(quotesById || {}) as any[];
                let acceptedId = 0;
                for (const q of values) {
                  if (Number(q?.booking_request_id) === Number(threadId) && String((q?.status || '')).toLowerCase() === 'accepted') {
                    acceptedId = Number(q?.id || 0);
                    break;
                  }
                }
                if (!acceptedId) {
                  try {
                    const br = await getBookingRequestCached(Number(threadId || 0));
                    acceptedId = Number((br as any)?.accepted_quote_id || 0);
                  } catch {}
                }
                if (!Number.isFinite(acceptedId) || acceptedId <= 0) return;
                // 4) Hydrate V2 to obtain booking_id
                const v2 = await getQuoteV2(acceptedId);
                const bid = Number((v2.data as any)?.booking_id || 0);
                if (Number.isFinite(bid) && bid > 0) {
                  try { sessionStorage.setItem(key, String(bid)); } catch {}
                  try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                }
              } catch {}
            }}
            isPaidOverride={paymentStatus === 'paid'}
            onPresenceUpdate={isBookaModeration ? undefined : (s) => setPresenceHeader(s.label)}
            /** KEY: hide composer on mobile when details sheet is open */
            isDetailsPanelOpen={showSidePanel}
            /** Disable composer for Booka system-only threads */
            disableComposer={isBookaModeration}
          />
        </div>

        {/* Client profile panel anchored at wrapper level */}
        {isThreadProvider && effectiveClientId > 0 && (
          <ClientProfilePanel
            clientId={effectiveClientId}
            clientName={
              effectiveBookingRequest
                ? counterpartyLabel(
                    effectiveBookingRequest as any,
                    user ?? undefined,
                    (effectiveBookingRequest as any)?.counterparty_label || undefined,
                    { viewerRole: 'provider' },
                  ) || undefined
                : undefined
            }
            clientAvatarUrl={
              effectiveBookingRequest
                ? (counterpartyAvatar(
                    effectiveBookingRequest as any,
                    user ?? undefined,
                    (effectiveBookingRequest as any)?.counterparty_avatar_url || null,
                    { viewerRole: 'provider' },
                  ) as string | null)
                : null
            }
            providerName={providerBusinessName}
            bookingRequestId={Number(bookingRequestId)}
            canReview={canProviderReviewClient}
            isOpen={showClientProfile}
            autoOpenReview={autoOpenClientReview}
            onClose={() => {
              setShowClientProfile(false);
              setAutoOpenClientReview(false);
            }}
          />
        )}

        {/* Provider profile panel for clients */}
        {isThreadClient && providerIdForProfile > 0 && (
          <ProviderProfilePanel
            providerId={providerIdForProfile}
            providerName={providerBusinessName}
            providerAvatarUrl={
              (effectiveBookingRequest?.artist_profile?.profile_picture_url ||
                (effectiveBookingRequest as any)?.counterparty_avatar_url ||
                null) as string | null
            }
            bookingId={confirmedBookingDetails?.id ?? null}
            canReview={Boolean(confirmedBookingDetails && String(confirmedBookingDetails.status || '').toLowerCase() === 'completed')}
            isOpen={showProviderProfile}
            autoOpenReview={autoOpenProviderReview}
            onClose={() => {
              setShowProviderProfile(false);
              setAutoOpenProviderReview(false);
            }}
          />
        )}

        {/* Desktop side panel */}
        <section
          id="reservation-panel-desktop"
          role="complementary"
          className={`hidden md:flex flex-col bg-white text-sm leading-6 transform transition-all duration-300 ease-in-out flex-shrink-0 md:static md:translate-x-0 md:overflow-y-auto ${
            showSidePanel
              ? 'border-l border-gray-200 md:w-[300px] lg:w-[360px] md:p-0 lg:p-0'
              : 'md:w-0 md:p-0 md:overflow-hidden'
          }`}
        >
          {bookingRequest ? (
            <BookingDetailsPanel
              bookingRequest={bookingRequest}
              parsedBookingDetails={parsedDetails}
              bookingConfirmed={bookingConfirmed}
              confirmedBookingDetails={confirmedBookingDetails}
              setShowReviewModal={setShowReviewModal}
              paymentModal={null}
              quotes={quotesById as Record<number, QuoteV2>}
              quotesLoading={quotesLoading}
              paymentStatus={paymentStatus}
              paymentAmount={paymentAmount}
              receiptUrl={receiptUrl}
              paymentReference={paymentReference}
              onBookingDetailsParsed={handleParsedDetails}
              onBookingDetailsHydrated={handleFallbackDetails}
              onHydratedBookingRequest={handleHydratedBookingRequest}
              openPaymentModal={(args) => {
                const provider =
                  (bookingRequest as any)?.service_provider_profile?.business_name ||
                  (bookingRequest as any)?.service_provider?.business_name ||
                  bookingRequest?.artist_profile?.business_name ||
                  (bookingRequest as any)?.artist?.first_name ||
                  'Service Provider';
                const serviceName = bookingRequest?.service?.title || undefined;
                openPaymentModal({
                  bookingRequestId: args.bookingRequestId,
                  amount: args.amount,
                  providerName: String(provider),
                  serviceName: serviceName as any,
                  customerEmail: (user as any)?.email || undefined,
                } as any);
              }}
            />
          ) : (
            <div className="mt-2">
              <BookingSummarySkeleton />
            </div>
          )}
        </section>

        {/* Mobile overlay backdrop */}
        {showSidePanel && (
          <div
            className="md:hidden fixed inset-0 z-[70] bg-black/30"
            onClick={() => setShowSidePanel(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile bottom sheet */}
        <section
          id="reservation-panel-mobile"
          role="complementary"
          aria-modal="true"
          className={`md:hidden fixed inset-x-0 bottom-0 z-[80] w-full bg-white shadow-2xl transform transition-transform duration-300 ease-out rounded-t-2xl text-sm leading-6 ${
            showSidePanel ? 'translate-y-0' : 'translate-y-full'
          } max-h-[85vh] h-[85vh] overflow-y-auto`}
        >
          <div className="sticky top-0 z-10 bg-white rounded-t-2xl px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
            <div
              className="mx-auto h-1.5 w-10 rounded-full bg-gray-300"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setShowSidePanel(false)}
              aria-label="Close details"
              className="absolute right-2 top-2 p-2 rounded-full hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          <div className="p-4">
            {bookingRequest ? (
              <BookingDetailsPanel
                bookingRequest={bookingRequest}
                parsedBookingDetails={parsedDetails}
                bookingConfirmed={bookingConfirmed}
                confirmedBookingDetails={confirmedBookingDetails}
                setShowReviewModal={setShowReviewModal}
                paymentModal={null}
                quotes={quotesById as Record<number, QuoteV2>}
                quotesLoading={quotesLoading}
                paymentStatus={paymentStatus}
                paymentAmount={paymentAmount}
                receiptUrl={receiptUrl}
                paymentReference={paymentReference}
                onBookingDetailsParsed={handleParsedDetails}
                onBookingDetailsHydrated={handleFallbackDetails}
                onHydratedBookingRequest={handleHydratedBookingRequest}
                openPaymentModal={(args) =>
                  openPaymentModal({ bookingRequestId: args.bookingRequestId, amount: args.amount, customerEmail: (user as any)?.email || undefined } as any)
                }
              />
            ) : (
              <BookingSummarySkeleton variant="modal" />
            )}
          </div>
        </section>
      </div>

      {/* Create Quote modal */}
      {showQuoteModal && effectiveBookingRequest && (
        <div className="fixed inset-0 z-[90]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowQuoteModal(false)} aria-hidden="true" />
          {/* Centered container */}
          <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4 sm:pt-[calc(var(--app-header-height,64px)+8px)] sm:items-start">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quote-modal-title"
              className="relative z-[91] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
            >
              <div id="quote-modal-title" className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
                <div className="font-semibold">Create quote</div>
                <button
                  type="button"
                  className="rounded-full p-2 hover:bg-gray-100"
                  onClick={() => setShowQuoteModal(false)}
                  aria-label="Close"
                >
                  <span className="block h-5 w-5 text-gray-600">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {isSoundThread ? (
                  <SoundInlineQuote
                    onSubmit={async (payload) => {
                      try {
                        const res = await createQuoteV2(payload);
                        try { setQuote(res.data as any); } catch {}
                        try { await ensureQuotesLoaded?.([Number(res.data.id)] as any); } catch {}
                        setShowQuoteModal(false);
                      } catch (e) {
                        console.error('Create quote failed', e);
                      }
                    }}
                    artistId={Number((effectiveBookingRequest as any).service_provider_id || (effectiveBookingRequest as any).artist_id || 0)}
                    clientId={Number((effectiveBookingRequest as any).client_id || 0)}
                    bookingRequestId={Number(bookingRequestId || 0)}
                    serviceName={effectiveBookingRequest?.service?.title}
                    initialBaseFee={effectiveBookingRequest?.service?.price ? Number(effectiveBookingRequest.service.price) : undefined}
                    initialTravelCost={
                      effectiveBookingRequest && effectiveBookingRequest.travel_cost != null
                        ? Number(effectiveBookingRequest.travel_cost)
                        : undefined
                    }
                    initialSoundNeeded={false}
                    providerVatRegistered={providerVatRegistered}
                    providerVatRate={providerVatRate ?? undefined}
                  />
                ) : (
                  <LivePerformanceInlineQuote
                  onSubmit={async (payload) => {
                    try {
                      const res = await createQuoteV2(payload);
                      try { setQuote(res.data as any); } catch {}
                      try { await ensureQuotesLoaded?.([Number(res.data.id)] as any); } catch {}
                      setShowQuoteModal(false);
                    } catch (e) {
                      console.error('Create quote failed', e);
                    }
                  }}
                  artistId={Number((effectiveBookingRequest as any).service_provider_id || (effectiveBookingRequest as any).artist_id || 0)}
                  clientId={Number((effectiveBookingRequest as any).client_id || 0)}
                  bookingRequestId={Number(bookingRequestId || 0)}
                  serviceName={effectiveBookingRequest?.service?.title}
                  initialBaseFee={effectiveBookingRequest?.service?.price ? Number(effectiveBookingRequest.service.price) : undefined}
                  initialTravelCost={
                    effectiveBookingRequest && effectiveBookingRequest.travel_cost != null
                      ? Number(effectiveBookingRequest.travel_cost)
                      : undefined
                  }
                    initialSoundNeeded={false}
                    providerVatRegistered={providerVatRegistered}
                    providerVatRate={providerVatRate ?? undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Details modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-[85]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetailsModal(false)} aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4 sm:pt-[calc(var(--app-header-height,64px)+8px)] sm:items-start">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="details-modal-title"
              className="relative z-[86] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
            >
              <div id="details-modal-title" className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
                <div className="font-semibold">Request Details</div>
                <button
                  type="button"
                  className="rounded-full p-2 hover:bg-gray-100"
                  onClick={() => setShowDetailsModal(false)}
                  aria-label="Close"
                >
                  <span className="block h-5 w-5 text-gray-600">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm leading-6">
                {parsedDetails ? (
                  <dl className="grid gap-2">
                    {parsedDetails.eventType && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Event Type</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.eventType}</dd>
                      </div>
                    )}
                    {parsedDetails.date && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Date</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.date}</dd>
                      </div>
                    )}
                    {parsedDetails.location && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Location</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.location}</dd>
                      </div>
                    )}
                    {parsedDetails.guests && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Guests</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.guests}</dd>
                      </div>
                    )}
                    {parsedDetails.venueType && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Venue</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.venueType}</dd>
                      </div>
                    )}
                    {parsedDetails.soundNeeded && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Sound</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.soundNeeded}</dd>
                      </div>
                    )}
                    {parsedDetails.description && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Description</dt>
                        <dd className="flex-1 text-gray-900 whitespace-pre-wrap">{parsedDetails.description}</dd>
                      </div>
                    )}
                    {parsedDetails.notes && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Notes</dt>
                        <dd className="flex-1 text-gray-900 whitespace-pre-wrap">{parsedDetails.notes}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <div className="text-gray-600">No details found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Always mount payment modal at root */}
      {paymentModal}
    </div>
  );
}
