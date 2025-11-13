'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getQuoteV2, getQuotesBatch, getQuotesForBookingRequest } from '@/lib/api';
import type { Quote, QuoteV2, ServiceItem } from '@/types';

function mapLegacyStatusToV2(status: string | null | undefined): QuoteV2['status'] {
  const s = String(status || '').toLowerCase();
  if (s.includes('accept')) return 'accepted';
  if (s.includes('reject') || s.includes('declin')) return 'rejected';
  if (s.includes('expire')) return 'expired';
  return 'pending';
}

/**
 * Convert a legacy Quote to a minimal QuoteV2 shape so UI can render consistently.
 * Uses best-effort defaults for fields that don't exist on legacy rows.
 */
export function toQuoteV2FromLegacy(legacy: Quote, opts: { clientId?: number } = {}): QuoteV2 {
  const services: ServiceItem[] = [
    {
      description: (legacy.quote_details || 'Performance'),
      price: Number(legacy.price || 0),
    },
  ];
  const sound_fee = 0;
  const travel_fee = 0;
  const discount = undefined as unknown as number | undefined; // optional downstream
  const subtotal = services.reduce((sum, s) => sum + Number(s.price || 0), 0);
  const legacyTotal = Number(legacy.price || subtotal);
  const total = Number.isFinite(legacyTotal) && legacyTotal > 0 ? legacyTotal : subtotal;
  const legacyPreview = (legacy as any)?.totals_preview;
  const providerSubtotalPreview = (legacy as any)?.provider_subtotal_preview;
  const bookaFeePreview = (legacy as any)?.booka_fee_preview;
  const bookaFeeVatPreview = (legacy as any)?.booka_fee_vat_preview;
  const clientTotalPreview = (legacy as any)?.client_total_preview;
  return {
    id: legacy.id,
    booking_request_id: legacy.booking_request_id,
    service_provider_id: legacy.service_provider_id,
    // Keep deprecated field for completeness if anything depends on it
    artist_id: legacy.artist_id,
    client_id: Number(opts.clientId || 0),
    services,
    sound_fee,
    travel_fee,
    accommodation: null,
    discount: (discount as any) ?? null,
    expires_at: legacy.valid_until ?? null,
    subtotal,
    total,
    totals_preview: legacyPreview ?? undefined,
    provider_subtotal_preview: providerSubtotalPreview ?? undefined,
    booka_fee_preview: bookaFeePreview ?? undefined,
    booka_fee_vat_preview: bookaFeeVatPreview ?? undefined,
    client_total_preview: clientTotalPreview ?? undefined,
    status: mapLegacyStatusToV2(legacy.status),
    created_at: legacy.created_at,
    updated_at: legacy.updated_at,
  } as QuoteV2;
}

function getGlobalQuotesMap(): Map<number, QuoteV2> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const m: Map<number, QuoteV2> = (globalThis as any).__GLOBAL_QUOTES__ || new Map<number, QuoteV2>();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (!(globalThis as any).__GLOBAL_QUOTES__) (globalThis as any).__GLOBAL_QUOTES__ = m;
  return m;
}

type QuotesSnapshot = Record<string, QuoteV2>;

const QUOTE_LISTENERS: Set<(snapshot: QuotesSnapshot) => void> = new Set();

function snapshotGlobalQuotes(): QuotesSnapshot {
  const MAP = getGlobalQuotesMap();
  const out: QuotesSnapshot = {};
  try {
    MAP.forEach((quote, id) => {
      if (!quote) return;
      out[String(id)] = quote;
    });
  } catch {}
  return out;
}

function emitQuoteUpdate() {
  const snapshot = snapshotGlobalQuotes();
  QUOTE_LISTENERS.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

function subscribeToQuotes(listener: (snapshot: QuotesSnapshot) => void) {
  QUOTE_LISTENERS.add(listener);
  return () => {
    QUOTE_LISTENERS.delete(listener);
  };
}

function shallowEqualQuotes(a: QuotesSnapshot, b: QuotesSnapshot): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/** Seed the global quotes cache with known quotes (batch prefetch helper). */
export function seedGlobalQuotes(quotes: QuoteV2[]) {
  try {
    const MAP = getGlobalQuotesMap();
    quotes.forEach((q) => { if (q && typeof q.id === 'number') MAP.set(q.id, q); });
    emitQuoteUpdate();
  } catch {}
}

/** Prefetch quotes by ids, normalizing legacy shapes to QuoteV2, and seed global cache. */
export async function prefetchQuotesByIds(ids: number[]) {
  const want = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0))) as number[];
  if (!want.length) return;
  try {
    const MAP = getGlobalQuotesMap();
    const missing = want.filter((id) => !MAP.has(id));
    if (!missing.length) return;
    const batch = await getQuotesBatch(missing);
    const got = Array.isArray(batch.data) ? (batch.data as any[]) : [];
    const normalized: QuoteV2[] = got.map((q: any) => {
      let next: QuoteV2;
      if (q && Array.isArray(q.services)) next = q as QuoteV2;
      else {
        try { next = toQuoteV2FromLegacy(q as Quote); }
        catch { next = q as QuoteV2; }
      }
      return {
        ...next,
        booking_request_id:
          next.booking_request_id != null
            ? Number(next.booking_request_id)
            : Number((q as any)?.booking_request_id ?? 0),
      } as QuoteV2;
    });
    seedGlobalQuotes(normalized);
  } catch {
    // ignore — prefetch is best-effort
  }
}

export function useQuotes(bookingRequestId: number, initialQuotes?: QuoteV2[] | null) {
  // Global, cross-instance cache so fast thread switches can render quotes immediately
  // without waiting for network refetch.
  // Keeps a best-effort in-memory map of QuoteV2 by id.
  // Note: intentionally module-scoped to persist across hook calls.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const GLOBAL_QUOTES = getGlobalQuotesMap();

  const seedKeyRef = useRef<number | null>(null);
  if (initialQuotes && initialQuotes.length && seedKeyRef.current !== bookingRequestId) {
    initialQuotes.forEach((q) => {
      if (q && typeof q.id === 'number') {
        try { GLOBAL_QUOTES.set(q.id, q); } catch {}
      }
    });
    seedKeyRef.current = bookingRequestId;
  }

  const [quotesById, setQuotesById] = useState<Record<string, QuoteV2>>(() => {
    // Seed with any previously known quotes to avoid skeletons on rapid switches
    try {
      const entries = Array.from(GLOBAL_QUOTES.entries());
      return entries.length ? Object.fromEntries(entries.map(([id, q]) => [id, q])) as Record<string, QuoteV2> : {};
    } catch {
      return {} as Record<string, QuoteV2>;
    }
  });
  const pendingRef = useRef<Set<number>>(new Set());
  const lastTryRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const listener = (snapshot: QuotesSnapshot) => {
      setQuotesById((prev) => (shallowEqualQuotes(prev, snapshot) ? prev : snapshot));
    };
    const unsubscribe = subscribeToQuotes(listener);
    listener(snapshotGlobalQuotes());
    return unsubscribe;
  }, []);

  const setQuote = useCallback((q: QuoteV2) => {
    if (!q || typeof q.id !== 'number') return;
    const normalized: QuoteV2 = {
      ...q,
      booking_request_id:
        q.booking_request_id != null
          ? Number(q.booking_request_id)
          : Number(bookingRequestId || 0),
    } as QuoteV2;
    const map = getGlobalQuotesMap();
    try { map.set(normalized.id, normalized); } catch {}
    setQuotesById((prev) => (prev[normalized.id] === normalized ? prev : { ...prev, [normalized.id]: normalized }));
    emitQuoteUpdate();
  }, [bookingRequestId]);

  const isComplete = (q: any): boolean => {
    try {
      if (!q) return false;
      const hasServices = Array.isArray(q.services) && q.services.length > 0;
      const hasTotalsPreview = !!((q as any)?.totals_preview || (q as any)?.client_total_preview || (q as any)?.provider_subtotal_preview);
      const hasAmounts = Number(q.total || 0) > 0 || Number(q.subtotal || 0) > 0;
      return hasServices || hasTotalsPreview || hasAmounts;
    } catch { return false; }
  };

  const ensureQuoteLoaded = useCallback(async (quoteId: number) => {
    if (!Number.isFinite(quoteId) || quoteId <= 0) return;
    const existing = quotesById[quoteId];
    if (existing && isComplete(existing)) return;
    // If present in global cache, hydrate local state immediately
    try {
      const hit = GLOBAL_QUOTES.get(quoteId);
      if (hit) {
        setQuotesById((prev) => ({ ...prev, [quoteId]: hit }));
        if (isComplete(hit)) return;
      }
    } catch {}
    if (pendingRef.current.has(quoteId)) return;
    const now = Date.now();
    const last = lastTryRef.current.get(quoteId) || 0;
    if (now - last < 10_000) return; // light backoff
    pendingRef.current.add(quoteId);
    lastTryRef.current.set(quoteId, now);
    try {
      const res = await getQuoteV2(quoteId);
      try { GLOBAL_QUOTES.set(quoteId, res.data); } catch {}
      setQuotesById((prev) => ({ ...prev, [quoteId]: res.data }));
      emitQuoteUpdate();
      return;
    } catch {}

    // Legacy fallback removed: avoid br/quotes list. If direct fetch failed, leave missing; UI will retry.
    finally {
      pendingRef.current.delete(quoteId);
    }
  }, [quotesById, bookingRequestId]);

  const ensureQuotesLoaded = useCallback(async (ids: number[]) => {
    const want = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
    const missing = want.filter((id) => {
      const q = quotesById[id];
      return !q || !isComplete(q);
    });
    if (missing.length === 0) return;
    // Try batch first
    try {
      const batch = await getQuotesBatch(missing);
      const got = Array.isArray(batch.data) ? (batch.data as any[]) : [];
      // Normalize: backend /quotes batch may return legacy Quote rows. Convert
      // any non-V2 shapes to QuoteV2 so the UI renders immediately.
      const normalized: QuoteV2[] = got.map((q: any) => {
        let next: QuoteV2;
        if (q && Array.isArray(q.services)) next = q as QuoteV2;
        else {
          try { next = toQuoteV2FromLegacy(q as Quote); }
          catch { next = q as QuoteV2; }
        }
        return {
          ...next,
          booking_request_id:
            next.booking_request_id != null
              ? Number(next.booking_request_id)
              : Number((q as any)?.booking_request_id ?? bookingRequestId ?? 0),
        } as QuoteV2;
      });
      if (normalized.length) {
        try { normalized.forEach((q: QuoteV2) => GLOBAL_QUOTES.set(q.id, q)); } catch {}
        setQuotesById((prev) => ({ ...prev, ...Object.fromEntries(normalized.map((q: QuoteV2) => [q.id, q])) }));
        emitQuoteUpdate();
      }
      const received = new Set<number>(normalized.map((q) => Number(q.id)).filter((n) => Number.isFinite(n)));
      const still = missing.filter((id) => {
        if (!received.has(id)) return true;
        const fresh = GLOBAL_QUOTES.get(id) || (quotesById as any)[id];
        return !isComplete(fresh);
      });
      // Individual fallback and legacy conversion
      await Promise.all(still.map((id) => ensureQuoteLoaded(id)));
    } catch {
      // If batch fails, fall back to individual
      await Promise.all(missing.map((id) => ensureQuoteLoaded(id)));
    }
  }, [quotesById, ensureQuoteLoaded]);

  const resetQuotes = useCallback(() => {
    setQuotesById({});
    emitQuoteUpdate();
  }, []);

  return useMemo(
    () => ({
      quotesById: quotesById as unknown as Record<number, QuoteV2>,
      setQuote,
      ensureQuoteLoaded,
      ensureQuotesLoaded,
      resetQuotes,
    }),
    [quotesById, setQuote, ensureQuoteLoaded, ensureQuotesLoaded, resetQuotes],
  );
}
