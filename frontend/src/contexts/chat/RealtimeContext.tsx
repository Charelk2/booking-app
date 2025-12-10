'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import useRealtime from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';
// Thread list mutations are owned by chat WS events; notifications should not
// bump per-thread unread to avoid drift. Keep only aggregate unread_total.

type RealtimeCtx = ReturnType<typeof useRealtime>;

const RealtimeContext = createContext<RealtimeCtx | null>(null);

//  Local read epochs per thread to suppress stale unread bumps that arrive after
// the user has already marked a thread as read in this tab.
const localReadEpochByThread: Map<number, number> = new Map();

export function noteLocalReadEpoch(threadId: number) {
  try {
    if (!Number.isFinite(threadId) || threadId <= 0) return;
    localReadEpochByThread.set(Number(threadId), Date.now());
  } catch {}
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundEnabledRef = useRef(true);
  const hasInteractedRef = useRef(false);
  const lastUnreadTotalRef = useRef<number | null>(null);
  // Single hook instance provides one WS/SSE connection for the entire app
  const rt = useRealtime(token || null);
  // Expose a value object that updates when either transport state OR
  // handler identities change so subscribers always receive fresh closures.
  // Previously this memo omitted method refs, which could leave consumers
  // with stale subscribe/publish callbacks and delay realtime delivery.
  const value = useMemo(
    () => ({
      mode: rt.mode,
      status: rt.status,
      lastReconnectDelay: rt.lastReconnectDelay,
      failureCount: rt.failureCount,
      subscribe: rt.subscribe,
      publish: rt.publish,
      forceReconnect: rt.forceReconnect,
    }),
    [rt.mode, rt.status, rt.lastReconnectDelay, rt.failureCount, rt.subscribe, rt.publish, rt.forceReconnect],
  );

  // Global notifications subscription: keep one topic to ensure WS opens early
  // even before AuthContext token is restored after a refresh (cookie auth works).
  const hasSession = !!token || !!user;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('BOOKA_MESSAGE_SOUND');
      if (stored === '0') soundEnabledRef.current = false;
    } catch {}
    try {
      const audio = new Audio('/sounds/new-message.mp3');
      audio.volume = 0.7;
      soundAudioRef.current = audio;
    } catch {}
    const markInteraction = () => {
      hasInteractedRef.current = true;
    };
    window.addEventListener('click', markInteraction);
    window.addEventListener('keydown', markInteraction);
    return () => {
      try {
        window.removeEventListener('click', markInteraction);
        window.removeEventListener('keydown', markInteraction);
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (!hasSession) return;
    const userId = Number(user?.id || 0);
    // Subscribe to a user-scoped notifications topic so messages from
    // the multiplex bus (`notifications:{user_id}`) are routed correctly.
    const topic = Number.isFinite(userId) && userId > 0 ? `notifications:${userId}` : 'notifications';

    const unsubscribe = rt.subscribe(topic, (payload: any) => {
      try {
        // Attachment finalized event → ensure the affected thread reconciles now
        if (payload && payload.type === 'message_finalized') {
          const threadId = Number(payload?.payload?.booking_request_id ?? 0);
          const messageId = Number(payload?.payload?.message_id ?? 0);
          if (Number.isFinite(threadId) && threadId > 0) {
            try { window.dispatchEvent(new CustomEvent('thread:pokedelta', { detail: { threadId, source: 'message_finalized' } })); } catch {}
            try { window.dispatchEvent(new CustomEvent('message:finalized', { detail: { threadId, messageId } })); } catch {}
          }
          return;
        }
        // Aggregate unread_total snapshot for header badge (do not touch per-thread unread).
        if (payload && payload.type === 'unread_total') {
          const totalRaw =
            (payload?.payload && (payload.payload.total ?? payload.payload.count)) ??
            payload.total ??
            payload.count;
          const totalNum = Number(totalRaw);
          if (Number.isFinite(totalNum) && typeof window !== 'undefined') {
            const total = Math.max(0, totalNum);
            try {
              window.dispatchEvent(
                new CustomEvent('inbox:unread_total', {
                  detail: { total },
                }),
              );
            } catch {}
            try {
              const prev = lastUnreadTotalRef.current;
              lastUnreadTotalRef.current = total;
              const shouldPlay =
                prev !== null &&
                total > prev &&
                soundEnabledRef.current &&
                hasInteractedRef.current &&
                soundAudioRef.current;
              if (shouldPlay) {
                try {
                  void soundAudioRef.current!.play().catch(() => {});
                } catch {
                  // ignore playback failures
                }
              }
            } catch {
              // best-effort only
            }
          }
          return;
        }
        // Ignore per-thread/unicast bumps; chat WS events own thread list updates.
        return;
      } catch {
        // best-effort only
      }
    });
    return () => { try { unsubscribe(); } catch {} };
  }, [rt, hasSession, user?.id]);

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
