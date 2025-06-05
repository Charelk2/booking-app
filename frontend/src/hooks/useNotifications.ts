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

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getNotifications()
      .then((res) => setNotifications(res.data))
      .catch((err) => {
        console.error('Failed to fetch notifications:', err);
        setError('Failed to load notifications.');
      })
      .finally(() => setLoading(false));
  }, [user]);

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
  };
}
