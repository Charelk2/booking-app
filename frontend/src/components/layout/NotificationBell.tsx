'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon, ChatBubbleOvalLeftEllipsisIcon, CalendarIcon } from '@heroicons/react/24/outline';
import NotificationDrawer from './NotificationDrawer';
import { formatDistanceToNow } from 'date-fns';
import useNotifications from '@/hooks/useNotifications';
import type { Notification, ThreadNotification } from '@/types';

// Displays a dropdown of recent notifications. Unread counts update via the
// `useNotifications` hook. Notifications are loaded incrementally for better
// performance on large accounts.

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

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

  const handleThreadClick = async (t: ThreadNotification) => {
    await markThread(t.booking_request_id);
    setOpen(false);
    router.push(t.link);
  };

  const markAllRead = async () => {
    await Promise.all(
      notifications.filter((n) => !n.is_read).map((n) => markRead(n.id)),
    );
  };

  const hasThreads = threads.length > 0;

  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.type || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

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
