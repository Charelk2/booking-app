'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import useRealtime from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';
import { threadStore } from '@/lib/chat/threadStore';

type RealtimeCtx = ReturnType<typeof useRealtime>;

const RealtimeContext = createContext<RealtimeCtx | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  // Single hook instance provides one WS/SSE connection for the entire app
  const rt = useRealtime(token || null);
  const value = useMemo(() => rt, [rt.mode, rt.status, rt.lastReconnectDelay, rt.failureCount]);

  // Global notifications subscription: bump unread for threads referenced by notifications
  useEffect(() => {
    // Subscribe once and keep across app lifetime
    const unsubscribe = rt.subscribe('notifications', (payload: any) => {
      try {
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
        // If this thread is not the active one, bump unread and nudge preview
        const active = threadStore.getActiveThreadId();
        if (active !== id) {
          const msg = String((payload && (payload.message || (payload.payload && payload.payload.message))) || '').trim();
          const nowIso = new Date().toISOString();
          // Update preview timestamp/content best-effort so the thread floats up; server will reconcile on next hydrate
          threadStore.update(id, { last_message_timestamp: nowIso, last_message_content: msg || 'New message' } as any);
          threadStore.incrementUnread(id, 1);
        }
      } catch {
        // best-effort only
      }
    });
    return () => { try { unsubscribe(); } catch {} };
  }, [rt]);

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
