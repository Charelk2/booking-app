'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getNotifications,
  getMessageThreads,
  markNotificationRead,
  markThreadRead,
  markAllNotificationsRead,
} from '@/lib/api';
import type { UnifiedNotification } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  mergeFeedItems,
  toUnifiedFromNotification,
  toUnifiedFromThread,
} from './notificationUtils';

export default function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(0);
  const limit = 20;
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (!user || !hasMore) return;
    setLoading(true);
    try {
      const res = await getNotifications(pageRef.current * limit, limit);
      const filtered = res.data
        .filter((n) => n.type !== 'new_message')
        .map(toUnifiedFromNotification);
      setItems((prev) => mergeFeedItems(prev, filtered));
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
  }, [user, hasMore]);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await getMessageThreads();
      const unified = res.data.map(toUnifiedFromThread);
      setItems((prev) => mergeFeedItems(prev, unified));
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

  const unreadCount = items.reduce(
    (acc, n) =>
      acc +
      (n.type === 'message'
        ? n.unread_count || 0
        : n.is_read
          ? 0
          : 1),
    0,
  );

  const markItem = async (item: UnifiedNotification) => {
    try {
      if (item.type === 'message' && item.booking_request_id) {
        await markThreadRead(item.booking_request_id);
        setItems((prev) =>
          prev.map((n) =>
            n.type === 'message' && n.booking_request_id === item.booking_request_id
              ? { ...n, is_read: true, unread_count: 0 }
              : n,
          ),
        );
      } else if (item.id) {
        const res = await markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((n) => (n.id === item.id ? toUnifiedFromNotification(res.data) : n)),
        );
      }
    } catch (err) {
      console.error('Failed to mark notification read:', err);
      setError('Failed to update notification.');
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true, unread_count: 0 })));
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      setError('Failed to update notification.');
    }
  };

  return {
    items,
    unreadCount,
    loading,
    error,
    markItem,
    markAll,
    loadMore,
    hasMore,
  };
}
