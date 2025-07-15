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
import axios from 'axios';
import toast from 'react-hot-toast';
import useWebSocket from './useWebSocket';
import { useAuth } from '@/contexts/AuthContext';
import type { Notification } from '@/types';

// Use the root API URL and include the /api prefix on each request so
// paths match the FastAPI router mounted with prefix="/api".
// All REST requests use the v1 prefix so calls line up with the backend router
// mounted at /api/v1.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL + '/api/v1',
  withCredentials: true,
});

let currentToken: string | null = null;

api.interceptors.request.use((config) => {
  if (currentToken) {
    config.headers = {
      ...(config.headers || {}),
      Authorization: `Bearer ${currentToken}`,
    };
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
  items: Notification[];
  markItem: (notification: Notification) => Promise<void>;
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
      if (axios.isAxiosError(err)) {
        setError(new Error(err.message));
      } else {
        setError(err as Error);
      }
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

  // Build the WebSocket URL including the API prefix so it matches
  // the FastAPI router mounted at `/api/v1`.
  const wsHost =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws');
  const wsUrl = token
    ? `${wsHost}/api/v1/ws/notifications?token=${encodeURIComponent(token)}`
    : null;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as Omit<Notification, 'is_read'>;
      const newNotif: Notification = { ...data, is_read: false };
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((c) => c + 1);
    } catch (e) {
      console.error('Failed to parse notification message', e);
    }
  }, []);

  const { onMessage } = useWebSocket(wsUrl);

  useEffect(() => onMessage(handleMessage), [onMessage, handleMessage]);

  const markAsRead = useCallback(async (id: number) => {
    // 1) optimistic update
    setNotifications((ns) =>
      ns.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.put(`/notifications/${id}/read`);
    } catch {
      // rollback
      setNotifications((ns) =>
        ns.map((n) => (n.id === id ? { ...n, is_read: false } : n)),
      );
      setUnreadCount((c) => c + 1);
      toast.error('Failed to mark notification read');
    }
  }, [api]);

  const markAllAsRead = useCallback(
    async () => {
      const prev = notifications;
      const prevCount = unreadCount;
      setNotifications((p) => p.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      try {
        await api.put('/notifications/read-all');
      } catch {
        setNotifications(prev);
        setUnreadCount(prevCount);
        toast.error('Failed to mark notifications read');
      }
    },
    [api, notifications, unreadCount],
  );

  const deleteNotification = useCallback(async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
      setError(err as Error);
    }
  }, []);

  const loadMore = useCallback(async () => {
    try {
      const res = await api.get<Notification[]>('/notifications', {
        params: {
          offset: notifications.length,
          limit: 20,
          unreadOnly: false,
        },
      });
      setNotifications((prev) => [...prev, ...res.data]);
      setHasMore(res.data.length === 20);
      setError(null);
    } catch (err) {
      console.error('Failed to load more notifications:', err);
      setError(err as Error);
    }
  }, [notifications.length]);

  const value: NotificationsContextValue = {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    // legacy compatibility
    items: notifications,
    markItem: (n: Notification) => markAsRead(n.id),
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
