'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@heroicons/react/24/outline';
import dynamic from 'next/dynamic';

const NotificationDrawer = dynamic(() => import('./NotificationDrawer'), {
  loading: () => <div className="p-4">Loading...</div>,
});

const FullScreenNotificationModal = dynamic(
  () => import('./FullScreenNotificationModal'),
  { loading: () => <div className="p-4">Loading...</div>, ssr: false },
);
import useIsMobile from '@/hooks/useIsMobile';
import useNotifications from '@/hooks/useNotifications';

// Displays a dropdown of recent notifications. Unread counts update via the
// `useNotifications` hook. Notifications are loaded incrementally for better
// performance on large accounts.

export default function NotificationBell(): JSX.Element {
  const {
    notifications,
    threads,
    unreadCount,
    markRead,
    markThread,
    markAll,
    loadMore,
    hasMore,
  } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  /**
   * Mark a notification as read and navigate to its link.
   *
   * NotificationDrawer only provides the notification ID, so we
   * lookup the full object here before acting.
   */
  const handleClick = async (id: number) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif) {
      console.error('Notification not found for id', id);
      return;
    }
    if (!notif.is_read) {
      await markRead(id);
    }
    setOpen(false);
    if (notif.link && typeof notif.link === 'string') {
      router.push(notif.link);
    } else {
      console.warn('Notification missing link', notif);
    }
  };

  const handleThreadClick = async (id: number) => {
    const thread = threads.find((t) => t.booking_request_id === id);
    if (!thread) {
      console.error('Thread not found for id', id);
      return;
    }
    await markThread(id);
    setOpen(false);
    router.push(`/messages/thread/${id}`);
  };

  const markAllRead = async () => {
    await markAll();
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
      {isMobile ? (
        <FullScreenNotificationModal
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
      ) : (
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
      )}
    </div>
  );
}
