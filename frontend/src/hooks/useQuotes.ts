'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getQuoteV2, getQuotesBatch } from '@/lib/api';
import type { QuoteV2 } from '@/types';

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

/** Prefetch quotes by ids (QuoteV2 only) and seed the global cache. */
export async function prefetchQuotesByIds(ids: number[]) {
  const want = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0))) as number[];
  if (!want.length) return;
  try {
    const MAP = getGlobalQuotesMap();
    const missing = want.filter((id) => !MAP.has(id));
    if (!missing.length) return;
    const batch = await getQuotesBatch(missing);
    const got = Array.isArray(batch.data) ? (batch.data as any[]) : [];
    const normalized: QuoteV2[] = got
      .filter((q: any) => q && Array.isArray((q as any).services))
      .map((q: any) => ({
        ...(q as QuoteV2),
        booking_request_id:
          (q as any)?.booking_request_id != null
            ? Number((q as any).booking_request_id)
            : 0,
      }));
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
    const missing: number[] = [];

    // First, hydrate from the global cache wherever possible and avoid network
    // calls when the sidecar has already provided complete quote objects.
    for (const id of want) {
      const local = quotesById[id];
      if (local && isComplete(local)) continue;
      let fromGlobal: QuoteV2 | undefined;
      try { fromGlobal = GLOBAL_QUOTES.get(id); } catch { fromGlobal = undefined; }
      if (fromGlobal && isComplete(fromGlobal)) {
        const hydrated = fromGlobal;
        setQuotesById((prev) => ({ ...prev, [id]: hydrated }));
        continue;
      }
      missing.push(id);
    }

    if (missing.length === 0) return;
    // Try batch first
    try {
      const batch = await getQuotesBatch(missing);
      const got = Array.isArray(batch.data) ? (batch.data as any[]) : [];
      const normalized: QuoteV2[] = got
        .filter((q: any) => q && Array.isArray((q as any).services))
        .map((q: any) => ({
          ...(q as QuoteV2),
          booking_request_id:
            (q as any)?.booking_request_id != null
              ? Number((q as any).booking_request_id)
              : Number(bookingRequestId ?? 0),
        }));
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
