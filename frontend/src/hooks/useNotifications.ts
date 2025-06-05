'use client';

import { useEffect, useState } from 'react';
import { getNotifications, markNotificationRead } from '@/lib/api';
import type { Notification } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!user) return;
    loadMore();
  }, [user]);

  const loadMore = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getNotifications(page * limit, limit);
      setNotifications((prev) => [...prev, ...res.data]);
      setPage((p) => p + 1);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    loadMore,
    hasMore: notifications.length % limit === 0,
  };
}
