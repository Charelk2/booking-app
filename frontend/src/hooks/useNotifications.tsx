'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import axios from 'axios';
import useWebSocket from './useWebSocket';
import { useAuth } from '@/contexts/AuthContext';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
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

  const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    withCredentials: true,
  });
  api.interceptors.request.use((config) => {
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  });

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Notification[]>('/api/v1/notifications', {
        params: { limit: 20, unreadOnly: false },
      });
      setNotifications(res.data);
      setUnreadCount(res.data.filter((n) => !n.read).length);
      setHasMore(res.data.length === 20);
      setError(null);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/ws/notifications?token=${encodeURIComponent(
    token || '',
  )}`;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as Omit<Notification, 'read'>;
      const newNotif: Notification = { ...data, read: false };
      setNotifications((prev) => [newNotif, ...prev]);
      setUnreadCount((c) => c + 1);
    } catch (e) {
      console.error('Failed to parse notification message', e);
    }
  }, []);

  const { onMessage } = useWebSocket(wsUrl);

  useEffect(() => onMessage(handleMessage), [onMessage, handleMessage]);

  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await api.patch(`/api/v1/notifications/${id}`);
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error('Failed to mark notification read:', err);
        setError(err as Error);
      }
    },
    [api],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await api.patch('/api/v1/notifications/mark-all-read');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      setError(err as Error);
    }
  }, [api]);

  const deleteNotification = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/api/v1/notifications/${id}`);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error('Failed to delete notification:', err);
        setError(err as Error);
      }
    },
    [api],
  );

  const loadMore = useCallback(async () => {
    try {
      const res = await api.get<Notification[]>('/api/v1/notifications', {
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
  }, [api, notifications]);

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
