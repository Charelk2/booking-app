'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@heroicons/react/24/outline';
import NotificationDrawer from './NotificationDrawer';
import useNotifications from '@/hooks/useNotifications';
import type { Notification } from '@/types';

// Displays a dropdown of recent notifications. Unread counts update via the
// `useNotifications` hook. Notifications are loaded incrementally for better
// performance on large accounts.

export default function NotificationBell() {
  const {
    notifications,
    threads,
    unreadCount,
    markRead,
    markThread,
    loadMore,
    hasMore,
  } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await markRead(n.id);
    }
    setOpen(false);
    router.push(n.link);
  };

  const handleThreadClick = async (id: number) => {
    const thread = threads.find((t) => t.booking_request_id === id);
    if (!thread) {
      console.error('Thread not found for id', id);
      return;
    }
    await markThread(id);
    setOpen(false);
    router.push(thread.link);
  };

  const markAllRead = async () => {
    await Promise.all(
      notifications.filter((n) => !n.is_read).map((n) => markRead(n.id)),
    );
  };


  return (
    <div className="relative ml-3" aria-live="polite">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex text-gray-400 hover:text-gray-600 focus:outline-none"
      >
        <span className="sr-only">View notifications</span>
        <BellIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>
      <NotificationDrawer
        open={open}
        onClose={() => setOpen(false)}
        notifications={notifications}
        threads={threads}
        markRead={handleClick}
        markThread={handleThreadClick}
        markAllRead={markAllRead}
        loadMore={loadMore}
        hasMore={hasMore}
      />
    </div>
  );
}
