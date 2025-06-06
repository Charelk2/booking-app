'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
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
  const hasThreads = threads.length > 0;
  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.type || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

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
                    {notifications.length === 0 && !hasThreads && (
                      <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
                    )}
                    {hasThreads && (
                      <div className="py-1" key="threads">
                        <p className="sticky top-0 z-10 bg-white px-4 pt-2 pb-1 border-b text-xs font-semibold text-gray-500">Messages</p>
                        {threads.map((t) => (
                          <div key={`thread-${t.booking_request_id}`} className="flex w-full items-start px-4 py-3 text-base gap-3">
                            <button
                              type="button"
                              onClick={() => markThread(t.booking_request_id)}
                              className={classNames('flex-1 text-left', t.unread_count > 0 ? 'font-medium' : 'text-gray-500')}
                            >
                              <span className="flex items-start gap-2">
                                <span className="flex-1">{t.name}{t.unread_count > 0 && ` — ${t.unread_count} new messages`}</span>
                              </span>
                              <span className="block w-full text-sm text-gray-400 truncate break-words">{t.last_message}</span>
                              <span className="block text-sm text-gray-400">
                                {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {Object.entries(grouped).map(([type, items]) => (
                      <div key={type} className="py-1">
                        <p className="sticky top-0 z-10 bg-white px-4 pt-2 pb-1 border-b text-xs font-semibold text-gray-500">
                          {type === 'booking_update' ? 'Bookings' : 'Other'}
                        </p>
                        {items.map((n) => (
                          <div key={`notif-${n.id}`} className="flex w-full items-start px-4 py-3 text-base gap-3">
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
                              className={classNames('flex-1 text-left', n.is_read ? 'text-gray-500' : 'font-medium')}
                            >
                              <span className="flex items-start gap-2">
                                <span className="flex-1">{n.message}</span>
                              </span>
                              <span className="block text-sm text-gray-400">
                                {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                              </span>
                            </button>
                            {!n.is_read ? (
                              <button
                                type="button"
                                onClick={() => markRead(n.id)}
                                className="text-sm text-indigo-600 hover:underline ml-2"
                                aria-label="Mark read"
                              >
                                Mark read
                              </button>
                            ) : (
                              <span className="ml-2 text-sm text-gray-400" aria-label="Read">
                                Read
                              </span>
                            )}
                          </div>
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
