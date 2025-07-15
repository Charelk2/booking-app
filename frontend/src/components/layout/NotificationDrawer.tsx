'use client';

import { Fragment, useState, useRef, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import NotificationListItem from './NotificationListItem';
import type { UnifiedNotification } from '@/types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  error?: Error | string | null;
}



export default function NotificationDrawer({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
  loadMore,
  hasMore,
  error,
}: NotificationDrawerProps) {
  const [showUnread, setShowUnread] = useState(false);
  const [listHeight, setListHeight] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      setListHeight(containerRef.current?.clientHeight ?? 400);
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const filtered = showUnread
    ? items.filter((i) =>
        i.type === 'message' ? (i.unread_count ?? 0) > 0 : !i.is_read,
      )
    : items;

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
                <Dialog.Panel className="pointer-events-auto w-screen max-w-sm bg-background shadow-xl flex flex-col">
                  <div className="sticky top-0 z-20 flex items-center justify-between bg-background px-4 py-3 border-b border-gray-200">
                    <Dialog.Title className="text-lg font-medium text-gray-900">Notifications</Dialog.Title>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowUnread((prev) => !prev)}
                        className="text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        data-testid="toggle-unread"
                      >
                        {showUnread ? 'Show All' : 'Unread Only'}
                      </button>
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-sm text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        Mark All as Read
                      </button>
                      <button
                        type="button"
                        className="rounded-md text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        onClick={onClose}
                      >
                        <span className="sr-only">Close panel</span>
                        <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="bg-red-100 text-red-800 text-sm px-4 py-2" data-testid="notification-error">
                      {error?.message}
                    </div>
                  )}
                  <div
                    className="flex-1 overflow-y-auto"
                    ref={containerRef}
                    data-testid="notification-list"
                  >
                    {filtered.length === 0 ? (
                      <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
                    ) : (
                      <List
                        height={listHeight}
                        itemCount={filtered.length + (hasMore ? 1 : 0)}
                        itemSize={84}
                        width="100%"
                        overscanCount={3}
                      >
                        {({ index, style }: ListChildComponentProps) => {
                          if (index < filtered.length) {
                            const n = filtered[index];
                            return (
                              <div style={style}>
                                <NotificationListItem
                                  n={n}
                                  onClick={() =>
                                    onItemClick(n.id || (n.booking_request_id as number))
                                  }
                                />
                              </div>
                            );
                          }
                          return (
                            <div style={style} className="px-4 py-2 border-t border-gray-200 text-center">
                              <button
                                type="button"
                                aria-label="Load more notifications"
                                onClick={loadMore}
                                className="text-sm text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                              >
                                Load more
                              </button>
                            </div>
                          );
                        }}
                      </List>
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
