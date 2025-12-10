'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from 'react';
import {
  getNotifications as apiGetNotifications,
  markNotificationRead as apiMarkNotificationRead,
  markAllNotificationsRead as apiMarkAllNotificationsRead,
  deleteNotification as apiDeleteNotification,
} from '@/lib/api';
import toast from 'react-hot-toast';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Notification, UnifiedNotification } from '@/types';
import { toUnifiedFromNotification } from './notificationUtils';
import { authAwareMessage } from '@/lib/utils';
import { updateSummary as cacheUpdateSummary } from '@/lib/chat/threadCache';
import { requestThreadPrefetch, kickThreadPrefetcher } from '@/lib/chat/threadPrefetcher';
import { emitThreadsUpdated } from '@/lib/chat/threadsEvents';

function extractThreadId(notif: Notification): number | null {
  const direct = (notif as any).booking_request_id ?? (notif as any).thread_id;
  if (Number.isFinite(direct)) return Number(direct);
  if (notif.link) {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
      const url = new URL(notif.link, origin);
      const id = url.searchParams.get('requestId') || url.searchParams.get('threadId');
      if (id && Number.isFinite(Number(id))) return Number(id);
    } catch {}
  }
  return null;
}

// Use shared API client functions which already handle credentials and
// one-time 401→refresh→retry behavior.


interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  /** compatibility with legacy hooks */
  items: UnifiedNotification[];
  markItem: (notification: UnifiedNotification) => Promise<void>;
  markAll: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

const NotificationsContext =
  createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const soundAudioRef = useRef<HTMLAudioElement | null>(null);
  const soundEnabledRef = useRef(true);
  const hasInteractedRef = useRef(false);
  const { user } = useAuth();

  // Cache ETag + throttle to avoid flooding the API while navigating
  const lastEtagRef = useRef<string | null>(null);
  const lastFetchAtRef = useRef<number>(0);
  const inflightRef = useRef<Promise<void> | null>(null);
  const fetchNotifications = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchAtRef.current < 5000) return; // 5s throttle
    if (inflightRef.current) return;
    setLoading(true);
    inflightRef.current = (async () => {
      try {
        const res = await apiGetNotifications(
          0,
          20,
          {
            headers: lastEtagRef.current ? { 'If-None-Match': lastEtagRef.current } : undefined,
            validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
          }
        );
        lastFetchAtRef.current = Date.now();
        const status = Number((res as any)?.status ?? 200);
        if (status === 304) {
          // Keep existing notifications; only bump ETag if server sent one.
          try { lastEtagRef.current = String((res as any)?.headers?.etag || '') || lastEtagRef.current; } catch {}
          setError(null);
          return;
        }
        try { lastEtagRef.current = String((res as any)?.headers?.etag || '') || lastEtagRef.current; } catch {}
        const items = (res.data as any) as Notification[];
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.is_read).length);
        setHasMore(items.length === 20);
        setError(null);
      } catch (err) {
      console.error('Failed to load notifications:', err);
      const msg = authAwareMessage(
        err,
        'Failed to load notifications. Please try again later.',
        'Failed to load notifications. Please log in to view your notifications.',
      );
      setError(new Error(msg));
      } finally {
      setLoading(false);
        inflightRef.current = null;
      }
    })();
    await inflightRef.current;
  }, []);

  useEffect(() => {
    if (!user) return;
    // Gentle delay to avoid contending with heavy first-paint API calls
    const t = setTimeout(() => { void fetchNotifications(); }, 1000);
    const id = setInterval(fetchNotifications, 30_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [fetchNotifications, user]);

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

  const { subscribe } = useRealtimeContext();

  useEffect(() => {
    if (!user) return;
    const userId = Number(user?.id || 0);
    const topic =
      Number.isFinite(userId) && userId > 0 ? `notifications:${userId}` : 'notifications';
    const unsub = subscribe(topic, (data) => {
      try {
        if (data.type === 'reconnect' || data.type === 'ping') return;
        if (!data.id || !data.timestamp) return;
        const newNotif: Notification = { ...(data as Notification), is_read: false };
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((c) => c + 1);
        const threadId = extractThreadId(newNotif);
        if (threadId) {
          const isActive =
            typeof window !== 'undefined' &&
            Number((window as any).__inboxActiveThreadId || 0) === Number(threadId);
          const docVisible =
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible';
          const isMessageType =
            newNotif.type === 'new_message' ||
            newNotif.type === 'message_thread_notification';
          const shouldPlaySound =
            isMessageType &&
            soundEnabledRef.current &&
            hasInteractedRef.current &&
            soundAudioRef.current &&
            !(docVisible && isActive);
          if (shouldPlaySound) {
            try {
              void soundAudioRef.current!.play().catch(() => {});
            } catch {}
          }
          // If the notification looks like a pending attachment (filename-only or placeholder) and we don't yet have a durable URL,
          // skip preview/unread updates here; fetch the finalized message shortly instead.
          try {
            const textRaw = String(newNotif.message || '').trim();
            const low = textRaw.toLowerCase();
            const looksFilename = !!textRaw && !low.includes(' ') && /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|webm|mkv|m4v|mp3|m4a|wav|ogg)$/i.test(textRaw);
            const isPlaceholder = low === 'image' || low === '[image]' || low === 'video' || low === '[video]' || low === 'audio' || low === '[audio]';
            if ((looksFilename || isPlaceholder) && typeof window !== 'undefined') {
              try { window.dispatchEvent(new CustomEvent('thread:pokedelta', { detail: { threadId, source: 'pending-attachment' } })); } catch {}
              return; // ignore preview/unread for now
            }
          } catch {}
          // Do not bump per-thread unread here; chat WS owns per-thread unread.
          // Derive a friendly preview label locally for known system lines to
          // avoid a brief flicker from raw content (e.g., order numbers) to the
          // server-normalized label after the subsequent fetch.
          const rawText = String(newNotif.message || '').trim();
          const lowText = rawText.toLowerCase();
          let previewLabel = rawText;
          // Payment received → always use a clean label in the list
          if (lowText.startsWith('payment received')) {
            previewLabel = 'Payment received';
          }
          // Update the shared cache summaries so the ConversationList reorders instantly
          // without waiting for a server refresh. This mirrors the active-thread path
          // where setMessages() updates summaries. Best-effort only.
          try {
            cacheUpdateSummary(threadId, {
              last_message_content: previewLabel,
              last_message_timestamp: newNotif.timestamp as any,
            } as any);
          } catch {}

          // Proactively warm the thread so opening it shows the new message immediately.
          try {
            requestThreadPrefetch(threadId, 360, 'realtime', true);
            kickThreadPrefetcher();
          } catch {}
          try {
            emitThreadsUpdated({ threadId, source: 'realtime', immediate: true }, { immediate: true, force: true });
          } catch {}

          // For active threads, nudge a tiny delta reconcile so the open view
          // picks up the latest state without relying on notification stubs.
          if (isActive && typeof window !== 'undefined') {
            try {
              window.dispatchEvent(
                new CustomEvent('thread:pokedelta', {
                  detail: { threadId, source: 'notification' },
                }),
              );
            } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to handle notification message', e);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, [subscribe, user]);

  const markAsRead = useCallback(async (id: number) => {
    // 1) optimistic update
    setNotifications((ns) =>
      ns.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiMarkNotificationRead(id);
    } catch (err) {
      // rollback
      setNotifications((ns) =>
        ns.map((n) => (n.id === id ? { ...n, is_read: false } : n)),
      );
      setUnreadCount((c) => c + 1);
      toast.error(
        authAwareMessage(
          err,
          'Failed to mark notification read',
          'Failed to mark notification read. Please log in to continue.',
        ),
      );
    }
  }, []);

  const markAllAsRead = useCallback(
    async () => {
      const prev = notifications;
      const prevCount = unreadCount;
      setNotifications((p) => p.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      try {
        await apiMarkAllNotificationsRead();
      } catch (err) {
        setNotifications(prev);
        setUnreadCount(prevCount);
        toast.error(
          authAwareMessage(
            err,
            'Failed to mark notifications read',
            'Failed to mark notifications read. Please log in to continue.',
          ),
        );
      }
    },
    [notifications, unreadCount],
  );

  const deleteNotification = useCallback(async (id: number) => {
    try {
      await apiDeleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
      const msg = authAwareMessage(
        err,
        'Failed to delete notification.',
        'Failed to delete notification. Please log in to continue.',
      );
      setError(new Error(msg));
    }
  }, []);

  const loadMore = useCallback(async () => {
    try {
      const res = await apiGetNotifications(notifications.length, 20);
      const items = res.data as any as Notification[];
      setNotifications((prev) => [...prev, ...items]);
      setHasMore(items.length === 20);
      setError(null);
    } catch (err) {
      console.error('Failed to load more notifications:', err);
      const msg = authAwareMessage(
        err,
        'Failed to load more notifications. Please try again later.',
        'Failed to load notifications. Please log in to view your notifications.',
      );
      setError(new Error(msg));
    }
  }, [notifications.length]);

  const unifiedItems = notifications.map(toUnifiedFromNotification);

  const value: NotificationsContextValue = {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    // legacy compatibility
    items: unifiedItems,
    markItem: (n: UnifiedNotification) => (n.id ? markAsRead(n.id) : Promise.resolve()),
    markAll: markAllAsRead,
    loadMore,
    hasMore,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      deleteNotification: async () => {},
      items: [],
      markItem: async () => {},
      markAll: async () => {},
      loadMore: async () => {},
      hasMore: false,
    } as NotificationsContextValue;
  }
  return ctx;
}

export default useNotifications;
