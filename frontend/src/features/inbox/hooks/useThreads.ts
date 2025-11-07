"use client";

import { useCallback, useEffect, useMemo } from 'react';
import { getMessageThreadsPreview } from '@/lib/api';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries, subscribe as cacheSubscribe } from '@/lib/chat/threadCache';
import type { BookingRequest, User } from '@/types';
import { initCrossTabSync } from '@/features/inbox/state/crossTab';

/**
 * useThreads: lightweight ETag-aware refresher for the unified threads index.
 *
 * Leaves cache hydration and persistence to the page-level effects which
 * already subscribe to threadStore and mirror to session/local storage.
 */
export function useThreads(user: User | null | undefined) {
  const etagKey = useMemo(() => {
    const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
    const uid = user?.id ? String(user.id) : 'anon';
    return `inbox:threadsIndexEtag:${role}:${uid}`;
  }, [user?.user_type, user?.id]);

  // Cache keys (session + long-lived)
  const cacheKey = useMemo(() => {
    const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
    const uid = user?.id ? String(user.id) : 'anon';
    return `inbox:threadsCache:v2:${role}:${uid}`;
  }, [user?.user_type, user?.id]);
  const latestCacheKey = 'inbox:threadsCache:latest';
  const persistKey = useMemo(() => `${cacheKey}:persist`, [cacheKey]);
  const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;

  // Subscribe to store changes and persist caches
  useEffect(() => {
    if (!user) return () => {};
    const persist = () => {
      try {
        const next = cacheGetSummaries();
        if (!Array.isArray(next) || next.length === 0) return;
        const json = JSON.stringify(next);
        sessionStorage.setItem(cacheKey, json);
        sessionStorage.setItem(latestCacheKey, json);
        localStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), items: next }));
      } catch {}
    };
    const unsubscribe = cacheSubscribe(persist);
    // Persist once on mount so initial cache is stored
    persist();
    return unsubscribe;
  }, [user, cacheKey, latestCacheKey, persistKey]);

  // Bootstrap from caches into store for fast first paint
  useEffect(() => {
    if (!user) return;
    try {
      const sessionCached = sessionStorage.getItem(cacheKey) || sessionStorage.getItem(latestCacheKey);
      if (sessionCached) {
        const items = JSON.parse(sessionCached) as BookingRequest[];
        if (Array.isArray(items) && items.length) {
          cacheSetSummaries(items as any);
          return;
        }
      }
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const obj = JSON.parse(raw) as { ts: number; items: BookingRequest[] };
        const age = Date.now() - Number(obj?.ts || 0);
        if (obj?.items && Array.isArray(obj.items) && obj.items.length && age >= 0 && age < PERSIST_TTL_MS) {
          cacheSetSummaries(obj.items as any);
          // also refresh session cache for tab lifetime
          try {
            const json = JSON.stringify(obj.items);
            sessionStorage.setItem(cacheKey, json);
            sessionStorage.setItem(latestCacheKey, json);
          } catch {}
        } else if (age >= PERSIST_TTL_MS) {
          try { localStorage.removeItem(persistKey); } catch {}
        }
      }
    } catch {}
  }, [user, cacheKey, latestCacheKey, persistKey]);

  // Initialize cross-tab sync (idempotent across mounts)
  useEffect(() => {
    if (!user) return () => {};
    const dispose = initCrossTabSync();
    return dispose;
  }, [user]);

  const refreshThreads = useCallback(async () => {
    if (!user) return false;
    const role = user.user_type === 'service_provider' ? 'artist' : 'client';
    let prevEtag: string | null = null;
    try {
      if (typeof window !== 'undefined') {
        prevEtag = sessionStorage.getItem(etagKey) || localStorage.getItem(etagKey);
      }
    } catch {}
    const res = await getMessageThreadsPreview(role as any, 100, prevEtag || undefined);
    const status = Number((res as any)?.status ?? 200);
    if (status === 304) return true;
    const items = (res?.data?.items || []) as any[];
    if (!Array.isArray(items)) return false;
    const mapped: BookingRequest[] = items.map((it: any) => ({
      id: Number(it.thread_id || it.booking_request_id || it.id),
      client_id: 0 as any,
      service_provider_id: 0 as any,
      status: (it.state as any) || 'pending_quote',
      created_at: it.last_ts,
      updated_at: it.last_ts,
      last_message_content: it.last_message_preview,
      last_message_timestamp: it.last_ts,
      is_unread_by_current_user: Number((it.unread_count || 0)) > 0 as any,
      unread_count: Number(it.unread_count || 0) as any,
      message: null,
      travel_mode: null,
      travel_cost: null,
      travel_breakdown: null,
      proposed_datetime_1: null,
      proposed_datetime_2: null,
      attachment_url: null,
      service_id: undefined,
      service: undefined,
      artist: undefined as any,
      counterparty_label: (it as any).counterparty?.name,
      counterparty_avatar_url: (it as any).counterparty?.avatar_url ?? null,
      ...(it?.state ? { thread_state: it.state } : {}),
    } as any));

    cacheSetSummaries(mapped as any);
    try {
      const newTag = (res as any)?.headers?.etag || (res as any)?.headers?.ETag;
      if (newTag && typeof window !== 'undefined') {
        sessionStorage.setItem(etagKey, String(newTag));
        try { localStorage.setItem(etagKey, String(newTag)); } catch {}
      }
    } catch {}
    return true;
  }, [user, etagKey]);

  return { refreshThreads } as const;
}
