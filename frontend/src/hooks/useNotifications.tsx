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
import toast from 'react-hot-toast';
import useRealtime from './useRealtime';
import { useAuth } from '@/contexts/AuthContext';
import type { Notification, UnifiedNotification } from '@/types';
import { toUnifiedFromNotification } from './notificationUtils';
import { authAwareMessage } from '@/lib/utils';

// Use the root API URL and include the /api prefix on each request so
// paths match the FastAPI router mounted with prefix="/api".
// All REST requests use the v1 prefix so calls line up with the backend router
// mounted at /api/v1.
const api = axios.create({
  baseURL: '/api/v1',
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
  const { token } = useAuth();
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
    currentToken = token;
  }, [token]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Notification[]>('/notifications', {
        params: { limit: 20, unreadOnly: false },
      });
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
    }
  }, []);

  useEffect(() => {
    if (!tokenRef.current) return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications, token]);

  const { subscribe, publish } = useRealtime(token || undefined);

  useEffect(() => {
    if (!token) return;
    const unsub = subscribe('notifications', (data) => {
      try {
        if (data.type === 'reconnect' || data.type === 'ping') return;
        if (!data.id || !data.timestamp) return;
        const newNotif: Notification = { ...(data as Notification), is_read: false };
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((c) => c + 1);
        try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('threads:updated')); } catch {}
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
