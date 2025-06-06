'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
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
  const hasThreads = threads.length > 0;
  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.type || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

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
              <button type="button" onClick={markAllRead} className="text-sm text-indigo-600">
                Mark All Read
              </button>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
              <div className="mt-2" key="threads">
                <div className="sticky top-0 bg-white px-4 py-2 z-10 border-b font-sans text-xs text-gray-600">
                  Messages
                </div>
                {threads.map((t) => (
                  <button
                    key={`mobile-thread-${t.booking_request_id}`}
                    type="button"
                    onClick={() => markThread(t.booking_request_id)}
                    className="group flex w-full items-start px-4 py-3 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:bg-gray-50"
                  >
                    {/* Avatar circle */}
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                      {t.name.split(' ').map((w) => w[0]).join('')}
                    </div>

                    {/* Rest of row */}
                    <div className="flex-1 text-left">
                      <span className="block font-medium text-gray-900">
                        {t.name}
                      </span>
                      <span className="block mt-0.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
                        {t.last_message}
                      </span>
                      <span className="block mt-1 text-sm text-gray-400">
                        {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {Object.entries(grouped).map(([type, items]) => (
              <div key={type} className="mt-4">
                <div className="sticky top-0 bg-white px-4 py-2 z-10 border-b font-sans text-xs text-gray-600">
                  {type === 'new_booking_request' ? 'Bookings' : 'Other'}
                </div>
                {items.map((n) => (
                  <button
                    key={`mobile-notif-${n.id}`}
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="group flex w-full items-start px-4 py-3 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:bg-gray-50"
                  >
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                      🔔
                    </div>

                    <div className="flex-1 text-left">
                      <span className="block font-medium text-gray-900 whitespace-pre-wrap break-words">
                        {n.message}
                      </span>
                      <span className="block mt-1 text-sm text-gray-400">
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
      </Dialog>
    </Transition.Root>
  );
}
