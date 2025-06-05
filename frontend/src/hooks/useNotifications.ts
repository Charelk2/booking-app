'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getNotifications,
  getMessageThreads,
  markNotificationRead,
  markThreadRead,
} from '@/lib/api';
import type { Notification, ThreadNotification } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  const [threads, setThreads] = useState<ThreadNotification[]>([]);

  const loadMore = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getNotifications(page * limit, limit);
      const filtered = res.data.filter((n) => n.type !== 'new_message');
      setNotifications((prev) => [...prev, ...filtered]);
      setPage((p) => p + 1);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [user, page]);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getMessageThreads();
      setThreads(res.data);
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
      setThreads((prev) => prev.filter((t) => t.booking_request_id !== requestId));
    } catch (err) {
      console.error('Failed to mark thread read:', err);
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
    loadMore,
    hasMore: notifications.length % limit === 0,
  };
}
