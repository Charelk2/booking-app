'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import useRealtime from '@/hooks/useRealtime';
import { useAuth } from '@/contexts/AuthContext';

// Thread list mutations are owned by chat WS events; notifications should not
// bump per-thread unread to avoid drift. Keep only aggregate unread_total.

/** ---------- Types ---------- */
type UseRealtime = ReturnType<typeof useRealtime>;

type RealtimeContextValue = Pick<
  UseRealtime,
  'mode' | 'status' | 'lastReconnectDelay' | 'failureCount' | 'subscribe' | 'publish' | 'forceReconnect'
>;

/** ---------- Context ---------- */
const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** ---------- Local read epochs ---------- */
// Local read epochs per thread to suppress stale unread bumps that arrive after
// the user has already marked a thread as read in this tab.
const localReadEpochByThread: Map<number, number> = new Map();

// Keep bounded to avoid unbounded growth in long-lived tabs.
const LOCAL_READ_EPOCH_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const LOCAL_READ_EPOCH_MAX = 500;

function pruneLocalReadEpochs(now: number) {
  // Drop expired entries
  localReadEpochByThread.forEach((ts, threadId) => {
    if (!Number.isFinite(ts) || now - ts > LOCAL_READ_EPOCH_TTL_MS) {
      localReadEpochByThread.delete(threadId);
    }
  });

  // Enforce max size by deleting oldest entries
  if (localReadEpochByThread.size <= LOCAL_READ_EPOCH_MAX) return;

  const entries = Array.from(localReadEpochByThread.entries()).sort((a, b) => a[1] - b[1]);
  const overflow = entries.length - LOCAL_READ_EPOCH_MAX;
  for (let i = 0; i < overflow; i += 1) {
    localReadEpochByThread.delete(entries[i][0]);
  }
}

export function noteLocalReadEpoch(threadId: number) {
  const id = Number(threadId);
  if (!Number.isFinite(id) || id <= 0) return;

  try {
    const now = Date.now();
    localReadEpochByThread.set(id, now);
    pruneLocalReadEpochs(now);
  } catch {
    // best-effort only
  }
}

/** ---------- Small helpers ---------- */
type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

const DEBUG_REALTIME = process.env.NODE_ENV !== 'production';

function reportNonFatal(err: unknown, context: string, extra?: UnknownRecord) {
  if (!DEBUG_REALTIME) return;
  try {
    // eslint-disable-next-line no-console
    console.warn(`[realtime] ${context}`, extra ?? {}, err);
  } catch {
    // ignore logging failures
  }
}

function dispatchWindowEvent<TDetail extends UnknownRecord>(name: string, detail: TDetail) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (err) {
    reportNonFatal(err, `dispatchEvent failed: ${name}`);
  }
}

/** ---------- Notification event contracts ---------- */
type UnreadTotalEvent = {
  type: 'unread_total';
  payload?: { total?: unknown; count?: unknown } | null;
  total?: unknown;
  count?: unknown;
};

type MessageFinalizedEvent = {
  type: 'message_finalized';
  payload?: { booking_request_id?: unknown; message_id?: unknown } | null;
};

// Allow unknown future types without breaking.
type NotificationsEvent = UnreadTotalEvent | MessageFinalizedEvent | { type: string; [k: string]: unknown };

function parseNotificationsEvent(raw: unknown): NotificationsEvent | null {
  if (!isRecord(raw)) return null;
  const type = raw.type;
  if (typeof type !== 'string' || type.trim() === '') return null;
  return raw as NotificationsEvent;
}

/** ---------- Sound ---------- */
const SOUND_URL = '/sounds/new-message.mp3';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();

  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundEnabledRef = useRef(true);
  const soundBrokenRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const lastUnreadTotalRef = useRef<number | null>(null);

  // Single hook instance provides one WS/SSE connection for the entire app
  const rt = useRealtime(token || null);

  // Expose a stable value object; updates when transport state or method identities change.
  const value = useMemo<RealtimeContextValue>(
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

  // Session heuristic; cookie auth may work even when token is null.
  const hasSession = Boolean(token || user);

  /** Init sound preference + audio element */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load preference
    try {
      soundEnabledRef.current = window.localStorage.getItem('BOOKA_MESSAGE_SOUND') !== '0';
    } catch (err) {
      reportNonFatal(err, 'sound preference read failed');
    }

    // Create audio element
    try {
      const audio = new Audio(SOUND_URL);
      audio.volume = 0.7;
      audio.preload = 'auto';

      const onError = () => {
        soundBrokenRef.current = true;
        reportNonFatal(null, 'sound asset failed to load', { url: SOUND_URL });
      };

      audio.addEventListener('error', onError);
      soundAudioRef.current = audio;

      try {
        audio.load();
      } catch (err) {
        reportNonFatal(err, 'audio.load threw');
      }

      return () => {
        try {
          audio.removeEventListener('error', onError);
        } catch {
          // ignore
        }
      };
    } catch (err) {
      reportNonFatal(err, 'Audio init failed', { url: SOUND_URL });
    }
  }, []);

  /** Unlock sound playback with first user interaction in the tab */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const markInteraction = () => {
      if (hasInteractedRef.current) return;
      hasInteractedRef.current = true;

      try {
        window.removeEventListener('pointerdown', markInteraction);
        window.removeEventListener('keydown', markInteraction);
        window.removeEventListener('click', markInteraction);
      } catch {
        // ignore
      }
    };

    try {
      window.addEventListener('pointerdown', markInteraction, { passive: true });
    } catch (err) {
      reportNonFatal(err, 'pointerdown listener attach failed');
    }
    window.addEventListener('keydown', markInteraction);
    window.addEventListener('click', markInteraction);

    return () => {
      try {
        window.removeEventListener('pointerdown', markInteraction);
        window.removeEventListener('keydown', markInteraction);
        window.removeEventListener('click', markInteraction);
      } catch {
        // ignore
      }
    };
  }, []);

  /** Clear tab-local caches when session ends to avoid leaking between logouts */
  useEffect(() => {
    if (hasSession) return;
    try {
      localReadEpochByThread.clear();
    } catch {
      // ignore
    }
    lastUnreadTotalRef.current = null;
  }, [hasSession]);

  /** Subscribe to notifications topic and handle only aggregate + finalized events */
  useEffect(() => {
    if (!hasSession) return;

    const userId = Number(user?.id || 0);
    const topic = Number.isFinite(userId) && userId > 0 ? `notifications:${userId}` : 'notifications';

    const unsubscribe = rt.subscribe(topic, (raw: unknown) => {
      const evt = parseNotificationsEvent(raw);
      if (!evt) return;

      try {
        switch (evt.type) {
          case 'message_finalized': {
            const p: UnknownRecord =
              evt.payload && isRecord(evt.payload) ? (evt.payload as UnknownRecord) : {};
            const threadId = toFiniteNumber(p.booking_request_id) ?? 0;
            const messageId = toFiniteNumber(p.message_id) ?? 0;

            if (threadId > 0) {
              dispatchWindowEvent('thread:pokedelta', { threadId, source: 'message_finalized' });
              dispatchWindowEvent('message:finalized', { threadId, messageId });
            }
            return;
          }

          case 'unread_total': {
            const p: UnknownRecord =
              evt.payload && isRecord(evt.payload) ? (evt.payload as UnknownRecord) : {};
            const totalRaw =
              (p.total ?? p.count) ??
              evt.total ??
              evt.count;

            const totalNum = toFiniteNumber(totalRaw);
            if (totalNum == null) return;

            const total = Math.max(0, totalNum);
            dispatchWindowEvent('inbox:unread_total', { total });

            const prev = lastUnreadTotalRef.current;
            lastUnreadTotalRef.current = total;

            const canPlaySound =
              prev !== null &&
              total > prev &&
              soundEnabledRef.current &&
              hasInteractedRef.current &&
              !soundBrokenRef.current &&
              Boolean(soundAudioRef.current);

            if (!canPlaySound) return;

            try {
              const audio = soundAudioRef.current!;
              try {
                audio.currentTime = 0;
              } catch {
                // ignore if not seekable yet
              }
              void audio.play().catch((err) => {
                reportNonFatal(err, 'audio.play rejected');
              });
            } catch (err) {
              reportNonFatal(err, 'audio.play threw');
            }

            return;
          }

          default:
            return;
        }
      } catch (err) {
        reportNonFatal(err, 'notification handler failed', { type: evt.type });
      }
    });

    return () => {
      try {
        unsubscribe?.();
      } catch (err) {
        reportNonFatal(err, 'unsubscribe failed', { topic });
      }
    };
  }, [hasSession, user?.id, rt.subscribe]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (ctx) return ctx;

  type SubscribeFn = RealtimeContextValue['subscribe'];
  type PublishFn = RealtimeContextValue['publish'];
  type ForceReconnectFn = RealtimeContextValue['forceReconnect'];

  const noopSubscribe: SubscribeFn = (..._args: Parameters<SubscribeFn>) =>
    ((() => {}) as unknown) as ReturnType<SubscribeFn>;

  const noopPublish: PublishFn = (..._args: Parameters<PublishFn>) =>
    (undefined as unknown) as ReturnType<PublishFn>;

  const noopForceReconnect: ForceReconnectFn = (..._args: Parameters<ForceReconnectFn>) =>
    (undefined as unknown) as ReturnType<ForceReconnectFn>;

  return {
    mode: 'ws' as RealtimeContextValue['mode'],
    status: 'closed' as RealtimeContextValue['status'],
    lastReconnectDelay: null,
    failureCount: 0,
    subscribe: noopSubscribe,
    publish: noopPublish,
    forceReconnect: noopForceReconnect,
  };
}
