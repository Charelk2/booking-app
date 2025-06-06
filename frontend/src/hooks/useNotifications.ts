'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getNotifications,
  getMessageThreads,
  markNotificationRead,
  markThreadRead,
  markAllNotificationsRead,
} from '@/lib/api';
import type { Notification, ThreadNotification } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { mergeNotifications } from './notificationUtils';

export default function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(0);
  const limit = 20;

  const [threads, setThreads] = useState<ThreadNotification[]>([]);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (!user || !hasMore) return;
    setLoading(true);
    try {
      const res = await getNotifications(pageRef.current * limit, limit);
      const filtered = res.data.filter((n) => n.type !== 'new_message');
      setNotifications((prev) => mergeNotifications(prev, filtered));
      pageRef.current += 1;
      if (res.data.length < limit) {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getMessageThreads();
      const sorted = [...res.data].sort((a, b) => {
        if ((b.unread_count > 0 ? 1 : 0) !== (a.unread_count > 0 ? 1 : 0)) {
          return b.unread_count - a.unread_count;
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      setThreads(sorted);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
      setError('Failed to load notifications.');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadMore();
    loadThreads();
  }, [user, loadMore, loadThreads]);

  const unreadCount =
    notifications.filter((n) => !n.is_read).length +
    threads.reduce((acc, t) => acc + t.unread_count, 0);

  const markRead = async (id: number) => {
    try {
      const res = await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? res.data : n)),
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      setError('Failed to update notification.');
    }
  };

  const markThread = async (requestId: number) => {
    try {
      await markThreadRead(requestId);
      setThreads((prev) =>
        prev.map((t) =>
          t.booking_request_id === requestId ? { ...t, unread_count: 0 } : t,
        ),
      );
    } catch (err) {
      console.error('Failed to mark thread read:', err);
      setError('Failed to update notification.');
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setThreads((prev) => prev.map((t) => ({ ...t, unread_count: 0 })));
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      setError('Failed to update notification.');
    }
  };

  return {
    notifications,
    threads,
    unreadCount,
    loading,
    error,
    markRead,
    markThread,
    markAll,
    loadMore,
    hasMore,
  };
}
