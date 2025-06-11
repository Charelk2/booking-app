'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { getFullImageUrl } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { Notification, ThreadNotification } from '@/types';

interface NotificationDrawerProps {
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

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function NotificationDrawer({
  open,
  onClose,
  notifications,
  threads,
  markRead,
  markThread,
  markAllRead,
  loadMore,
  hasMore,
}: NotificationDrawerProps) {
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

  const handleThreadClick = async (id: number) => {
    await markThread(id);
    router.push(`/messages/thread/${id}`);
  };

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-sm bg-white shadow-xl flex flex-col">
                  <div className="sticky top-0 z-20 flex items-center justify-between bg-white px-4 py-3 border-b border-gray-200">
                    <Dialog.Title className="text-lg font-medium text-gray-900">Notifications</Dialog.Title>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowUnread((prev) => !prev)}
                        className="text-sm text-gray-600 hover:underline"
                        data-testid="toggle-unread"
                      >
                        {showUnread ? 'Show All' : 'Unread Only'}
                      </button>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-sm text-indigo-600 hover:underline"
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        className="rounded-md text-gray-400 hover:text-gray-600 focus:outline-none"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {filteredNotifications.length === 0 && !hasThreads && (
                      <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
                    )}
                    {hasThreads && (
                      <div className="py-1" key="threads">
                        <p className="sticky top-0 z-10 bg-white px-4 pt-2 pb-1 border-b text-xs font-semibold text-gray-500">Messages</p>
                        {filteredThreads.map((t) => (
                          <button
                            key={`thread-${t.booking_request_id}`}
                            type="button"
                            onClick={() => handleThreadClick(t.booking_request_id)}
                          className={classNames(
                              'group flex w-full items-start px-4 py-3 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:bg-gray-100 cursor-pointer rounded',
                              t.unread_count > 0
                                ? 'font-medium border-l-4 border-indigo-500'
                                : 'text-gray-500 border-l-4 border-transparent',
                            )}
                          >
                          {t.avatar_url ? (
                            <Image
                              src={getFullImageUrl(t.avatar_url) as string}
                              alt="avatar"
                              width={40}
                              height={40}
                              className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                              {t.name
                                .split(' ')
                                .map((word) => word[0])
                                .join('')}
                            </div>
                          )}
                            <div className="flex-1 text-left">
                              <span className="block font-medium text-gray-900">
                                {t.name}
                                {t.unread_count > 0 && ` — ${t.unread_count} new messages`}
                              </span>
                              <span className="block mt-0.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
                                {t.last_message}
                              </span>
                              <span className="block mt-1 text-xs text-gray-400">
                                {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {Object.entries(grouped).map(([type, items]) => (
                      <div key={type} className="py-1">
                        <p className="sticky top-0 z-10 bg-white px-4 pt-2 pb-1 border-b text-xs font-semibold text-gray-500">
                          {type === 'new_booking_request'
                            ? 'Bookings'
                            : type === 'booking_status_updated'
                              ? 'Bookings'
                              : 'Other'}
                        </p>
                        {items.map((n) => (
                          <button
                            key={`notif-${n.id}`}
                            type="button"
                            onClick={() => markRead(n.id)}
                          className={classNames(
                              'group flex w-full items-start px-4 py-3 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:bg-gray-100',
                              n.is_read
                                ? 'text-gray-500 border-l-4 border-transparent'
                                : 'font-medium border-l-4 border-indigo-500',
                            )}
                          >
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                              🔔
                            </div>
                            <div className="flex-1 text-left">
                              <span className="block font-medium text-gray-900 whitespace-pre-wrap break-words">
                                {n.message}
                              </span>
                              <span className="block mt-1 text-xs text-gray-400">
                                {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                    {hasMore && (
                      <div className="px-4 py-2 border-t border-gray-200 text-center">
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
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
