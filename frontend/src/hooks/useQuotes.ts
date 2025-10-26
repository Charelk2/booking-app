'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
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
  // Include 15% VAT for legacy quotes to align with v2 totals
  const total = Math.round(subtotal * 1.15 * 100) / 100;
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

/** Seed the global quotes cache with known quotes (batch prefetch helper). */
export function seedGlobalQuotes(quotes: QuoteV2[]) {
  try {
    const MAP = getGlobalQuotesMap();
    quotes.forEach((q) => { if (q && typeof q.id === 'number') MAP.set(q.id, q); });
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
      if (q && Array.isArray(q.services)) return q as QuoteV2; // already v2ish
      try { return toQuoteV2FromLegacy(q as Quote); } catch { return q as QuoteV2; }
    });
    seedGlobalQuotes(normalized);
  } catch {
    // ignore — prefetch is best-effort
  }
}

export function useQuotes(bookingRequestId: number) {
  // Global, cross-instance cache so fast thread switches can render quotes immediately
  // without waiting for network refetch.
  // Keeps a best-effort in-memory map of QuoteV2 by id.
  // Note: intentionally module-scoped to persist across hook calls.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const GLOBAL_QUOTES = getGlobalQuotesMap();

  const [quotesById, setQuotesById] = useState<Record<number, QuoteV2>>(() => {
    // Seed with any previously known quotes to avoid skeletons on rapid switches
    try {
      const entries = Array.from(GLOBAL_QUOTES.entries());
      return entries.length ? Object.fromEntries(entries.map(([id, q]) => [id, q])) as Record<number, QuoteV2> : {};
    } catch {
      return {} as Record<number, QuoteV2>;
    }
  });
  const pendingRef = useRef<Set<number>>(new Set());
  const lastTryRef = useRef<Map<number, number>>(new Map());

  const setQuote = useCallback((q: QuoteV2) => {
    if (!q || typeof q.id !== 'number') return;
    try { GLOBAL_QUOTES.set(q.id, q); } catch {}
    setQuotesById((prev) => (prev[q.id] === q ? prev : { ...prev, [q.id]: q }));
  }, []);

  const ensureQuoteLoaded = useCallback(async (quoteId: number) => {
    if (!Number.isFinite(quoteId) || quoteId <= 0) return;
    if (quotesById[quoteId]) return;
    // If present in global cache, hydrate local state immediately
    try {
      const hit = GLOBAL_QUOTES.get(quoteId);
      if (hit) {
        setQuotesById((prev) => ({ ...prev, [quoteId]: hit }));
        return;
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
      return;
    } catch {}

    // Legacy fallback: fetch list and convert the matching quote
    try {
      const list = await getQuotesForBookingRequest(bookingRequestId);
      const arr = Array.isArray(list.data) ? list.data : [];
      const legacy = arr.find((q: any) => Number(q?.id) === Number(quoteId));
      if (legacy) {
        const adapted = toQuoteV2FromLegacy(legacy as Quote);
        try { GLOBAL_QUOTES.set(quoteId, adapted); } catch {}
        setQuotesById((prev) => ({ ...prev, [quoteId]: adapted }));
      }
    } catch {}
    finally {
      pendingRef.current.delete(quoteId);
    }
  }, [quotesById, bookingRequestId]);

  const ensureQuotesLoaded = useCallback(async (ids: number[]) => {
    const want = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
    const missing = want.filter((id) => !quotesById[id]);
    if (missing.length === 0) return;
    // Try batch first
    try {
      const batch = await getQuotesBatch(missing);
      const got = Array.isArray(batch.data) ? (batch.data as any[]) : [];
      // Normalize: backend /quotes batch may return legacy Quote rows. Convert
      // any non-V2 shapes to QuoteV2 so the UI renders immediately.
      const normalized: QuoteV2[] = got.map((q: any) => {
        if (q && Array.isArray(q.services)) return q as QuoteV2; // already v2-ish
        try { return toQuoteV2FromLegacy(q as Quote); } catch { return q as QuoteV2; }
      });
      if (normalized.length) {
        try { normalized.forEach((q: QuoteV2) => GLOBAL_QUOTES.set(q.id, q)); } catch {}
        setQuotesById((prev) => ({ ...prev, ...Object.fromEntries(normalized.map((q: QuoteV2) => [q.id, q])) }));
      }
      const received = new Set<number>(normalized.map((q) => Number(q.id)).filter((n) => Number.isFinite(n)));
      const still = missing.filter((id) => !received.has(id));
      // Individual fallback and legacy conversion
      await Promise.all(still.map((id) => ensureQuoteLoaded(id)));
    } catch {
      // If batch fails, fall back to individual
      await Promise.all(missing.map((id) => ensureQuoteLoaded(id)));
    }
  }, [quotesById, ensureQuoteLoaded]);

  const resetQuotes = useCallback(() => setQuotesById({}), []);

  return useMemo(() => ({ quotesById, setQuote, ensureQuoteLoaded, ensureQuotesLoaded, resetQuotes }), [quotesById, setQuote, ensureQuoteLoaded, ensureQuotesLoaded, resetQuotes]);
}
