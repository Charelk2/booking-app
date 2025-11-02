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
import axios, { type AxiosRequestHeaders } from 'axios';
import { getApiOrigin } from '@/lib/api';
import toast from 'react-hot-toast';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Notification, UnifiedNotification } from '@/types';
import { toUnifiedFromNotification } from './notificationUtils';
import { authAwareMessage } from '@/lib/utils';
import { threadStore } from '@/lib/chat/threadStore';
import { readThreadCache, updateSummary as cacheUpdateSummary } from '@/lib/chat/threadCache';
import { addEphemeralStub } from '@/lib/chat/ephemeralStubs';
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

// Use the root API URL and include the /api prefix on each request so
// paths match the FastAPI router mounted with prefix="/api".
// All REST requests use the v1 prefix so calls line up with the backend router
// mounted at /api/v1.
const api = axios.create({
  baseURL: `${getApiOrigin()}/api/v1`,
  withCredentials: true,
});

let currentToken: string | null = null;

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers = {
      ...(config.headers as AxiosRequestHeaders),
      Authorization: `Bearer ${currentToken}`,
    } as AxiosRequestHeaders;
  }
  return config;
});


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
  const { token, user } = useAuth();
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
    currentToken = token;
  }, [token]);

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
        const res = await api.get<Notification[]>('/notifications', {
          params: { limit: 20, unreadOnly: false },
          validateStatus: (s) => s === 200 || s === 304,
          headers: lastEtagRef.current ? { 'If-None-Match': lastEtagRef.current } : undefined,
        });
        lastFetchAtRef.current = Date.now();
        try { lastEtagRef.current = String((res.headers as any)?.etag || '') || lastEtagRef.current; } catch {}
        if (res.status === 304) { setLoading(false); inflightRef.current = null; return; }
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n) => !n.is_read).length);
      setHasMore(res.data.length === 20);
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
    if (!tokenRef.current) return;
    // Gentle delay to avoid contending with heavy first-paint API calls
    const t = setTimeout(() => { void fetchNotifications(); }, 1000);
    const id = setInterval(fetchNotifications, 30_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [fetchNotifications, token]);

  const { subscribe, publish } = useRealtimeContext();

  useEffect(() => {
    if (!token) return;
    const unsub = subscribe('notifications', (data) => {
      try {
        if (data.type === 'reconnect' || data.type === 'ping') return;
        if (!data.id || !data.timestamp) return;
        const newNotif: Notification = { ...(data as Notification), is_read: false };
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((c) => c + 1);
        const threadId = extractThreadId(newNotif);
        if (threadId) {
          const isActive = threadStore.getActiveThreadId() === threadId;
          const prev = threadStore.getThread(threadId);
          if (isActive) {
            threadStore.applyRead(threadId, prev?.last_message_id ?? null);
            // Keep cache summaries in sync so ConversationList updates immediately
            // Best-effort: dynamic import avoids bundling issues in edge runtimes
            void (async () => {
              try {
                const lastId = Number(prev?.last_message_id ?? 0) || undefined;
                const { setLastRead: cacheSetLastRead } = await import('@/lib/chat/threadCache');
                cacheSetLastRead(threadId, lastId);
              } catch {}
            })();
          }
          const nextUnread = isActive ? 0 : (Number(prev?.unread_count || 0) + 1);
          threadStore.upsert({
            id: threadId,
            unread_count: nextUnread,
            is_unread_by_current_user: nextUnread > 0,
            last_message_content: newNotif.message,
            last_message_timestamp: newNotif.timestamp,
            counterparty_label: newNotif.sender_name || prev?.counterparty_label || undefined,
          } as any);

          // Also update the shared cache summaries so the ConversationList reorders instantly
          // without waiting for a server refresh. This mirrors the active-thread path
          // where setMessages() updates summaries. Best-effort only.
          try {
            cacheUpdateSummary(threadId, {
              last_message_content: newNotif.message,
              last_message_timestamp: newNotif.timestamp as any,
              unread_count: nextUnread,
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

          // Best-effort synthetic stub via ephemeral overlay (overwritten by the subsequent fetch)
          try {
            const base = (readThreadCache(threadId) || []) as any[];
            const text = String(newNotif.message || '');
            const low = text.trim().toLowerCase();
            const isSystem = (
              low.startsWith('booking details:') ||
              low.startsWith('payment received') ||
              low.startsWith('booking confirmed') ||
              low.startsWith('listing approved:') ||
              low.startsWith('listing rejected:')
            );
            // Skip ephemeral stub for new booking requests only for service providers.
            const isNewRequest = low.startsWith('booking details:') || low.includes('new booking request') || low.includes('you have a new booking request');
            const isProvider = String((user as any)?.user_type || '').toLowerCase() === 'service_provider';
            if (!(isProvider && isNewRequest)) {
              const stub = {
                id: -Date.now(),
                booking_request_id: threadId,
                sender_id: 0,
                sender_type: 'client',
                content: text,
                message_type: isSystem ? 'SYSTEM' : 'USER',
                visible_to: 'both',
                is_read: isActive,
                timestamp: newNotif.timestamp,
                avatar_url: null,
              } as any;
              // Push stub to ephemeral overlay; persist layer remains clean
              addEphemeralStub(threadId, stub);
            }
            // If the active thread matches, nudge a delta reconcile to force-tail visibility
            if (isActive && typeof window !== 'undefined') {
              try { window.dispatchEvent(new CustomEvent('thread:pokedelta', { detail: { threadId, source: 'notification' } })); } catch {}
            }
          } catch {}
          if (!isActive && typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('inbox:unread', { detail: { delta: 1, threadId } }));
            } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to handle notification message', e);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, [subscribe, token]);

  const markAsRead = useCallback(async (id: number) => {
    // 1) optimistic update
    setNotifications((ns) =>
      ns.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${id}/read`);
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
        await api.put('/notifications/read-all');
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
      await api.delete(`/notifications/${id}`);
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
      const res = await api.get<Notification[]>('/notifications', {
        params: {
          skip: notifications.length,
          limit: 20,
          unreadOnly: false,
        },
      });
      setNotifications((prev) => [...prev, ...res.data]);
      setHasMore(res.data.length === 20);
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
