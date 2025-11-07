'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SafeImage from '@/components/ui/SafeImage';

import type { Booking, BookingRequest, Quote, QuoteV2 } from '@/types';
import * as api from '@/lib/api';
import { useAuth as useContextAuth } from '@/contexts/AuthContext';
import { getFullImageUrl } from '@/lib/utils';

import MessageThread from '@/components/chat/MessageThread/index.web';
import BookingDetailsPanel from '@/components/chat/BookingDetailsPanel';
import usePaymentModal from '@/hooks/usePaymentModal';
import InlineQuoteForm from '@/components/chat/InlineQuoteForm';
import { createQuoteV2, getQuotesForBookingRequest, getQuoteV2, getBookingIdForRequest } from '@/lib/api';
import BookingSummarySkeleton from '@/components/chat/BookingSummarySkeleton';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { counterpartyLabel } from '@/lib/names';
import { useQuotes, prefetchQuotesByIds, toQuoteV2FromLegacy } from '@/hooks/useQuotes';
import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';
import { parseBookingDetailsFromMessage } from '@/lib/chat/bookingDetails';

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

  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);

  const [parsedDetails, setParsedDetails] = useState<ParsedBookingDetails | null>(() => {
    if (!bookingRequestId) return null;
    return readCachedDetails(bookingRequestId) ?? null;
  });
  const [presenceHeader, setPresenceHeader] = useState<string>('');

  const [isUserArtist, setIsUserArtist] = useState(false);
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

  useEffect(() => {
    setIsUserArtist(Boolean(user && user.user_type === 'service_provider'));
  }, [user]);

  useEffect(() => {
    if (!bookingRequestId || typeof window === 'undefined') return;
    try {
      if (!receiptUrl) {
        const cachedUrl = window.localStorage.getItem(`receipt_url:br:${bookingRequestId}`);
        if (cachedUrl) setReceiptUrl(cachedUrl);
      }
      if (!paymentReference) {
        const cachedRef = window.localStorage.getItem(`receipt_ref:br:${bookingRequestId}`);
        if (cachedRef) setPaymentReference(cachedRef);
      }
    } catch {}
  }, [bookingRequestId, receiptUrl, paymentReference]);

  useEffect(() => {
    if (!bookingRequest) return;
    if (!paymentStatus) {
      const candidates = [
        (bookingRequest as any)?.payment_status,
        (bookingRequest as any)?.latest_payment_status,
        (bookingRequest as any)?.booking?.payment_status,
      ];
      for (const candidate of candidates) {
        if (!candidate) continue;
        const str = String(candidate).trim();
        if (!str) continue;
        setPaymentStatus(str);
        break;
      }
    }
    if (paymentAmount == null) {
      const amountCandidates = [
        (bookingRequest as any)?.payment_amount,
        (bookingRequest as any)?.latest_payment_amount,
        (bookingRequest as any)?.booking?.payment_amount,
      ];
      for (const candidate of amountCandidates) {
        if (candidate == null) continue;
        const num = Number(candidate);
        if (Number.isFinite(num)) {
          setPaymentAmount(num);
          break;
        }
      }
    }
    if (!receiptUrl || !paymentReference) {
      const receiptCandidates = [
        (bookingRequest as any)?.receipt_url,
        (bookingRequest as any)?.payment_receipt_url,
        (bookingRequest as any)?.latest_receipt_url,
        (bookingRequest as any)?.booking?.receipt_url,
      ];
      for (const candidate of receiptCandidates) {
        if (!candidate) continue;
        const str = String(candidate).trim();
        if (!str) continue;
        const absolute = /^https?:\/\//i.test(str) ? str : api.apiUrl(str);
        if (!receiptUrl) {
          setReceiptUrl(absolute);
          try {
            if (typeof window !== 'undefined' && bookingRequestId) {
              window.localStorage.setItem(`receipt_url:br:${bookingRequestId}`, absolute);
            }
          } catch {}
        }
        break;
      }
    }
    if (!paymentReference) {
      const referenceCandidates = [
        (bookingRequest as any)?.payment_reference,
        (bookingRequest as any)?.latest_payment_reference,
        (bookingRequest as any)?.payment_id,
        (bookingRequest as any)?.booking?.payment_reference,
        (bookingRequest as any)?.booking?.payment_id,
      ];
      for (const candidate of referenceCandidates) {
        if (!candidate) continue;
        const str = String(candidate).trim();
        if (!str) continue;
        setPaymentReference((prev) => {
          if (!prev) {
            try {
              if (typeof window !== 'undefined' && bookingRequestId) {
                window.localStorage.setItem(`receipt_ref:br:${bookingRequestId}`, str);
              }
            } catch {}
            return str;
          }
          return prev;
        });
        break;
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

  /** Quotes for totals in the side panel */
  const initialQuotes = useMemo(() => {
    if (!bookingRequest) return [] as QuoteV2[];
    const arr = Array.isArray((bookingRequest as any)?.quotes) ? (bookingRequest as any).quotes : [];
    const normalized: QuoteV2[] = [];
      const seen = new Set<number>();
      for (const raw of arr) {
        if (!raw) continue;
        let q: QuoteV2 | null = null;
        if (Array.isArray((raw as any)?.services)) {
          q = raw as QuoteV2;
        } else {
          try {
            q = toQuoteV2FromLegacy(raw as Quote, { clientId: (bookingRequest as any)?.client_id });
          } catch {
            q = null;
          }
        }
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
      const res = await api.getQuotesForBookingRequest(Number(bookingRequestId || 0));
      const arr = Array.isArray(res.data) ? (res.data as any[]) : [];
      for (const raw of arr) {
        let normalized: QuoteV2 | null = null;
        if (Array.isArray((raw as any)?.services)) {
          normalized = raw as QuoteV2;
        } else {
          try {
            normalized = toQuoteV2FromLegacy(raw as Quote, { clientId: (bookingRequest as any)?.client_id });
          } catch {
            normalized = null;
          }
        }
        if (normalized && typeof normalized.id === 'number') {
          const bookingId = Number(normalized.booking_request_id ?? bookingRequestId ?? 0) || Number(bookingRequestId || 0);
          setQuote({ ...normalized, booking_request_id: bookingId } as QuoteV2);
        }
      }
    } catch { /* ignore */ }
  }, [bookingRequestId, setQuote, bookingRequest]);

  const handleHydratedBookingRequest = useCallback((request: BookingRequest) => {
    canonicalHydrateAttemptedRef.current = true;
    let seededQuotes = false;
    try {
      const arr = Array.isArray((request as any)?.quotes) ? (request as any).quotes : [];
      const normalized: QuoteV2[] = [];
      const seen = new Set<number>();
      for (const raw of arr) {
        if (!raw) continue;
        let q: QuoteV2 | null = null;
        if (Array.isArray((raw as any)?.services)) {
          q = raw as QuoteV2;
        } else {
          try {
            q = toQuoteV2FromLegacy(raw as Quote, { clientId: (request as any)?.client_id });
          } catch {
            q = null;
          }
        }
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
        } catch {
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

  /** Close on ESC (mobile) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSidePanel(false);
    };
    if (showSidePanel) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSidePanel]);

  /** Back button closes the sheet first (mobile) */
  useEffect(() => {
    const handlePopState = () => {
      if (showSidePanel) setShowSidePanel(false);
      else router.back();
    };
    window.addEventListener('popstate', handlePopState);
    if (showSidePanel) window.history.pushState(null, '');
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSidePanel, router]);

  /** Lock background scroll while any overlay is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (showSidePanel || showQuoteModal || showDetailsModal) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = prev || '';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [showSidePanel, showQuoteModal, showDetailsModal]);

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
    const text = (bookingRequest?.last_message_content || '').toString();
    const synthetic = Boolean((bookingRequest as any)?.is_booka_synthetic);
    const label = (bookingRequest as any)?.counterparty_label || '';
    return synthetic || label === 'Booka' || /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
  })();

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Unified header */}
      <header className="sticky top-0 z-10 bg-white text-gray-900 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between border-b border-gray-200 md:min-h-[64px]">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {bookingRequest ? (
            isBookaModeration ? (
              <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center text-base font-medium" aria-label="Booka system">
                B
              </div>
            ) : isUserArtist ? (
              (bookingRequest.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ? (
                <SafeImage
                  src={(bookingRequest.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) as string}
                  alt="Client avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center text-base font-medium text-white" aria-hidden>
                  {(counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'U') || 'U').charAt(0)}
                </div>
              )
            ) : (bookingRequest.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ? (
              <Link
                href={`/service-providers/${
                  (bookingRequest as any).service_provider_id ||
                  (bookingRequest as any).artist_id ||
                  (bookingRequest as any).artist?.id ||
                  (bookingRequest as any).artist_profile?.user_id ||
                  (bookingRequest as any).service?.service_provider_id ||
                  (bookingRequest as any).service?.artist_id ||
                  (bookingRequest as any).service?.artist?.user_id ||
                  ''
                }`}
                aria-label="Service Provider profile"
                className="flex-shrink-0"
              >
                <SafeImage
                  src={(bookingRequest.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) as string}
                  alt="Service Provider avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              </Link>
            ) : (
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base font-medium text-gray-600" aria-hidden>
                {(counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'U') || 'U').charAt(0)}
              </div>
            )
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200" aria-hidden />
          )}

          {/* Name + presence */}
          <div className="flex flex-col">
            <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
              {bookingRequest
                ? (isBookaModeration
                    ? 'Booka'
                    : counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'User') || 'User')
                : 'Messages'}
            </span>
            {presenceHeader && !isBookaModeration ? (
              <span className="text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis -mt-0.5">
                {presenceHeader}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-2 sm:px-4">
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
            initialBookingRequest={bookingRequest}
            isActive={isActive}
            serviceId={bookingRequest?.service_id ?? undefined}
            clientName={isUserArtist
              ? (counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'Client') || 'Client')
              : (user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'Client')}
            artistName={!isUserArtist
              ? (counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'Service Provider') || 'Service Provider')
              : (bookingRequest?.artist_profile?.business_name || (bookingRequest as any)?.artist?.business_name || (bookingRequest as any)?.artist?.first_name || 'Service Provider')}
            artistAvatarUrl={!isUserArtist
              ? ((bookingRequest?.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ?? null)
              : (bookingRequest?.artist_profile?.profile_picture_url ?? null)}
            clientAvatarUrl={isUserArtist
              ? ((bookingRequest?.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ?? null)
              : (bookingRequest?.client?.profile_picture_url ?? null)}
            serviceName={bookingRequest?.service?.title}
            initialNotes={bookingRequest?.message ?? null}
            artistCancellationPolicy={bookingRequest?.artist_profile?.cancellation_policy ?? null}
            initialBaseFee={bookingRequest?.service?.price ? Number(bookingRequest.service.price) : undefined}
            initialTravelCost={bookingRequest && bookingRequest.travel_cost !== null && bookingRequest.travel_cost !== undefined ? Number(bookingRequest.travel_cost) : undefined}
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
            onOpenDetailsPanel={() => setShowDetailsModal((s) => !s)}
            onOpenQuote={() => setShowQuoteModal(true)}
            onPayNow={(quote: any) => {
              try {
                // Prefer backend preview (Total To Pay); fallback to local 3% + VAT on fee
                const ps = Number(quote?.provider_subtotal_preview ?? quote?.subtotal ?? 0) || 0;
                const fee = Number.isFinite(Number(quote?.booka_fee_preview))
                  ? Number(quote?.booka_fee_preview)
                  : Math.round(ps * 0.03 * 100) / 100;
                const feeVat = Number.isFinite(Number(quote?.booka_fee_vat_preview))
                  ? Number(quote?.booka_fee_vat_preview)
                  : Math.round(fee * 0.15 * 100) / 100;
                const clientTotal = Number.isFinite(Number(quote?.client_total_preview))
                  ? Number(quote?.client_total_preview)
                  : Math.round(((Number(quote?.total || 0)) + fee + feeVat) * 100) / 100;
                const provider = bookingRequest?.artist_profile?.business_name || (bookingRequest as any)?.artist?.first_name || 'Service Provider';
                const serviceName = bookingRequest?.service?.title || undefined;
                if (clientTotal > 0) openPaymentModal({
                  bookingRequestId,
                  amount: clientTotal,
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

        {/* Desktop side panel */}
        <section
          id="reservation-panel-desktop"
          role="complementary"
          className={`hidden md:flex flex-col bg-white text-sm leading-6 transform transition-all duration-300 ease-in-out flex-shrink-0 md:static md:translate-x-0 md:overflow-y-auto ${
            showSidePanel
              ? 'border-l border-gray-200 md:w-[300px] lg:w-[360px] md:p-5 lg:p-6'
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
              openPaymentModal={(args: { bookingRequestId: number; amount: number }) => {
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
                openPaymentModal={(args: { bookingRequestId: number; amount: number }) =>
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
      {showQuoteModal && bookingRequest && (
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
                <InlineQuoteForm
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
                  artistId={Number((bookingRequest as any).service_provider_id || (bookingRequest as any).artist_id || 0)}
                  clientId={Number((bookingRequest as any).client_id || 0)}
                  bookingRequestId={Number(bookingRequestId || 0)}
                  serviceName={bookingRequest?.service?.title}
                  initialBaseFee={bookingRequest?.service?.price ? Number(bookingRequest.service.price) : undefined}
                  initialTravelCost={bookingRequest && bookingRequest.travel_cost != null ? Number(bookingRequest.travel_cost) : undefined}
                  initialSoundNeeded={false}
                />
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
