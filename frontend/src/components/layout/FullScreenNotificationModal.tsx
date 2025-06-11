'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Transition } from '@headlessui/react';
// Mobile layout previously used swipe actions. Cards are easier to read on
// small screens so we now display a scrollable list of cards instead.
import { XMarkIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

const getStatusFromMessage = (message: string): string | null => {
  const match = message.match(/status updated to (\w+)/i);
  if (match) return match[1].replace(/_/g, ' ');
  if (/new booking request/i.test(message)) return 'new';
  return null;
};
import type { Notification, ThreadNotification } from '@/types';

interface FullScreenNotificationModalProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  threads: ThreadNotification[];
  markRead: (id: number) => Promise<void>;
  markThread: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}


export default function FullScreenNotificationModal({
  open,
  onClose,
  notifications,
  threads,
  markRead,
  markThread,
  markAllRead,
  loadMore,
  hasMore,
}: FullScreenNotificationModalProps) {
  const router = useRouter();
  const [showUnread, setShowUnread] = useState(false);
  const filteredThreads = showUnread
    ? threads.filter((t) => t.unread_count > 0)
    : threads;
  const filteredNotifications = showUnread
    ? notifications.filter((n) => !n.is_read)
    : notifications;
  const hasThreads = filteredThreads.length > 0;
  const grouped = filteredNotifications.reduce<Record<string, Notification[]>>(
    (acc, n) => {
      const key = n.type || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(n);
      return acc;
    },
    {},
  );

  const navigateToBooking = async (
    link: string,
    id: number,
    markFn: (targetId: number) => Promise<void>,
  ) => {
    await markFn(id);
    if (link) router.push(link);
  };

  const handleThreadClick = async (id: number) => {
    await markThread(id);
    router.push(`/messages/thread/${id}`);
  };

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          {/* Hide overlay on small screens so it doesn't block clicks */}
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 hidden sm:block" />
        </Transition.Child>

        <Dialog.Panel className="flex h-full w-full flex-col bg-white">
          <div className="sticky top-0 z-20 flex items-center justify-between bg-white border-b px-4 py-3">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUnread((prev) => !prev)}
                className="text-sm text-gray-600 hover:underline"
                data-testid="toggle-unread"
              >
                {showUnread ? 'Show All' : 'Unread Only'}
              </button>
              <button type="button" onClick={markAllRead} className="text-sm text-indigo-600">
                Mark All as Read
              </button>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <span className="sr-only">Close panel</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {notifications.length === 0 && !hasThreads ? (
              <div className="flex h-full items-center justify-center text-gray-500 text-center">
                🎉 You&apos;re all caught up!
              </div>
            ) : (
              <div className="space-y-4">
                {hasThreads &&
                  filteredThreads.map((t) => {
                    const status = getStatusFromMessage(t.last_message);
                    return (
                      <div
                        key={`thread-${t.booking_request_id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleThreadClick(t.booking_request_id)}
                        onKeyPress={() => handleThreadClick(t.booking_request_id)}
                        className={classNames(
                          'relative bg-white shadow rounded-lg p-4 flex flex-col space-y-2 transition hover:bg-gray-50 cursor-pointer active:bg-gray-100',
                          t.unread_count > 0
                            ? 'border-l-4 border-indigo-500'
                            : 'border-l-4 border-transparent text-gray-500',
                        )}
                      >
                        {status && (
                          <span className="absolute top-2 right-2 rounded-full bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5">
                            {status}
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{t.name}</span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                            {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 truncate">{t.last_message}</div>
                        <span className="text-xs self-start bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {t.unread_count > 0 ? 'New' : 'Seen'}
                        </span>
                      </div>
                    );
                  })}
                {Object.values(grouped).map((items) =>
                  items.map((n) => {
                    const status = getStatusFromMessage(n.message);
                    return (
                      <div
                        key={`notif-${n.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigateToBooking(n.link, n.id, markRead)}
                        onKeyPress={() => navigateToBooking(n.link, n.id, markRead)}
                        className={classNames(
                          'relative bg-white shadow rounded-lg p-4 flex flex-col space-y-2 transition hover:bg-gray-50',
                          n.is_read
                            ? 'border-l-4 border-transparent text-gray-500'
                            : 'border-l-4 border-indigo-500',
                        )}
                      >
                        {status && (
                          <span className="absolute top-2 right-2 rounded-full bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5">
                            {status}
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="font-semibold whitespace-pre-wrap break-words">
                            {n.message}
                          </span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                            {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <span className="text-xs self-start bg-gray-100 text-gray-700 px-2 py-1 rounded">
                          {n.is_read ? 'Seen' : 'New'}
                        </span>
                      </div>
                    );
                  })
                )}
                {hasMore && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={loadMore}
                      className="text-sm text-indigo-600 hover:underline focus:outline-none"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Panel>
      </Dialog>
    </Transition.Root>
  );
}
