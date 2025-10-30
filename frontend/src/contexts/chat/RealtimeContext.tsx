'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import useRealtime from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries } from '@/lib/chat/threadCache';

type RealtimeCtx = ReturnType<typeof useRealtime>;

const RealtimeContext = createContext<RealtimeCtx | null>(null);

// Local read epochs per thread to suppress stale unread bumps that arrive after
// the user has already marked a thread as read in this tab.
const localReadEpochByThread: Map<number, number> = new Map();

export function noteLocalReadEpoch(threadId: number) {
  try {
    if (!Number.isFinite(threadId) || threadId <= 0) return;
    localReadEpochByThread.set(Number(threadId), Date.now());
  } catch {}
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  // Single hook instance provides one WS/SSE connection for the entire app
  const rt = useRealtime(token || null);
  const value = useMemo(() => rt, [rt.mode, rt.status, rt.lastReconnectDelay, rt.failureCount]);

  // Global notifications subscription: bump unread for threads referenced by notifications
  useEffect(() => {
    // Do not subscribe/open until we have a token to avoid 403 flaps
    if (!token) return;
    const unsubscribe = rt.subscribe('notifications', (payload: any) => {
      try {
        // Header aggregate push: unread_total → trigger recompute in hooks
        if (payload && (payload.type === 'unread_total' || (payload.payload && typeof payload.payload.total === 'number'))) {
          try { window.dispatchEvent(new CustomEvent('inbox:unread', { detail: { total: Number(payload?.payload?.total ?? 0) } })); } catch {}
          return;
        }
        const link = String((payload && (payload.link || (payload.payload && payload.payload.link))) || '');
        if (!link) return;
        // Extract booking request id from link (supports /booking-requests/{id} or /inbox?requestId={id})
        let id = 0;
        const m1 = link.match(/\/booking-requests\/(\d+)/);
        if (m1 && m1[1]) id = Number(m1[1]);
        if (!id) {
          const m2 = link.match(/requestId=(\d+)/i);
          if (m2 && m2[1]) id = Number(m2[1]);
        }
        if (!Number.isFinite(id) || id <= 0) return;
        const msg = String((payload && (payload.message || (payload.payload && payload.payload.message))) || '').trim();
        // Prefer server-provided timestamp if present to compare with local read epoch
        const nowIso = new Date().toISOString();
        const createdAt = String((payload && (payload.created_at || (payload.payload && payload.payload.created_at))) || nowIso);
        const ts = Date.parse(createdAt) || Date.now();
        const list = cacheGetSummaries() as any[];
        let found = false;
        const next = list.map((t) => {
          if (Number(t?.id) !== id) return t;
          found = true;
          const lastLocal = localReadEpochByThread.get(id) || 0;
          if (lastLocal && ts <= lastLocal) return t; // stale relative to local read
          const unread = Math.max(0, Number(t?.unread_count || 0)) + 1;
          return { ...t, last_message_timestamp: nowIso, last_message_content: msg || 'New message', unread_count: unread };
        });
        if (found) {
          cacheSetSummaries(next as any);
        } else {
          const lastLocal = localReadEpochByThread.get(id) || 0;
          if (!lastLocal || ts > lastLocal) {
            cacheSetSummaries([{ id, last_message_timestamp: nowIso, last_message_content: msg || 'New message', unread_count: 1 } as any, ...list] as any);
          }
        }
      } catch {
        // best-effort only
      }
    });
    return () => { try { unsubscribe(); } catch {} };
  }, [rt, token]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    // Return a benign no-op object if provider is missing (tests, SSR)
    return {
      mode: 'ws',
      status: 'closed',
      lastReconnectDelay: null,
      failureCount: 0,
      subscribe: () => () => {},
      publish: () => {},
      forceReconnect: () => {},
    } as unknown as RealtimeCtx;
  }
  return ctx;
}
'// moved to contexts/chat'
