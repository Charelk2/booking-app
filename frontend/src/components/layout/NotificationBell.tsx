'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@heroicons/react/24/outline';
import dynamic from 'next/dynamic';

const NotificationDrawer = dynamic(
  () => import('./NotificationDrawer'),
  {
    loading: () => <div className="p-4">Loading...</div>,
    ssr: false,
  },
);

const FullScreenNotificationModal = dynamic(
  () => import('./FullScreenNotificationModal'),
  { loading: () => <div className="p-4">Loading...</div>, ssr: false },
);

function prefetchNotifications() {
  import('./NotificationDrawer');
  import('./FullScreenNotificationModal');
}
import useIsMobile from '@/hooks/useIsMobile';
// Import from TSX to avoid re-export TDZ issues
import useNotifications from '@/hooks/useNotifications.tsx';
import type { UnifiedNotification } from '@/types';

// Displays a dropdown of recent notifications. Unread counts update via the
// `useNotifications` hook. Notifications are loaded incrementally for better
// performance on large accounts.

export default function NotificationBell(): JSX.Element {
  const {
    items,
    unreadCount,
    markItem,
    markAll,
    loadMore,
    hasMore,
    error,
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
  const handleItemClick = async (itemId: number) => {
    const item = items.find(
      (i: UnifiedNotification) => (i.id || i.booking_request_id) === itemId,
    );
    if (!item) {
      console.error('Notification not found for id', itemId);
      return;
    }
    if (!item.is_read) {
      await markItem(item);
    }
    setOpen(false);
    if (item.link) {
      router.push(item.link);
    } else {
      console.warn('Notification missing link', item);
    }
  };

  const markAllRead = async () => {
    await markAll();
  };


  return (
    <div className="relative" aria-live="polite">
      <button
        type="button"
        onClick={() => setOpen(true)}
        onMouseEnter={prefetchNotifications}
        onFocus={prefetchNotifications}
        className="flex text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="sr-only">View notifications</span>
        <BellIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
          </span>
        )}
      </button>
      {isMobile ? (
        <FullScreenNotificationModal
          open={open}
          onClose={() => setOpen(false)}
          items={items}
          onItemClick={handleItemClick}
          markAllRead={markAllRead}
          loadMore={loadMore}
          hasMore={hasMore}
          error={error}
        />
      ) : (
        <NotificationDrawer
          open={open}
          onClose={() => setOpen(false)}
          items={items}
          onItemClick={handleItemClick}
          markAllRead={markAllRead}
          error={error}
        />
      )}
    </div>
  );
}
