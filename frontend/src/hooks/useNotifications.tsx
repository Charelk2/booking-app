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

const api = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}/api/v1`,
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
      setUnreadCount(res.data.filter((n) => !n.read).length);
      setHasMore(res.data.length === 20);
      setError(null);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  const wsBase =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/ws/notifications${token ? `?token=${encodeURIComponent(token)}` : ''}`;

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

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.patch(`/notifications/${id}`, { read: true });
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      toast.error('Failed to mark notification read');
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n)),
      );
      setUnreadCount((c) => c + 1);
      setError(err as Error);
      throw err;
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      setError(err as Error);
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
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
