'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import useRealtime from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';
// Thread list mutations are owned by chat WS events; notifications should not
// bump per-thread unread to avoid drift. Keep only aggregate unread_total.

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
        // Ignore per-thread/unicast bumps; chat WS events own thread list updates.
        return;
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
