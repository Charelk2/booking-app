'use client';

import { Fragment, useState, useRef, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import NotificationListItem from './NotificationListItem';
import { ToggleSwitch, IconButton } from '../ui';
import type { UnifiedNotification } from '@/types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  error?: Error | string | null;
}



export default function NotificationDrawer({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
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
          <div className="fixed inset-0 bg-gray-900/40 transition-opacity" />
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
                <Dialog.Panel
                  as={motion.div}
                  className="pointer-events-auto w-80 rounded-l-2xl bg-white shadow-xl flex flex-col"
                >
                  <header className="flex items-center justify-between px-4 py-2 bg-white border-b rounded-tl-2xl">
                    <Dialog.Title className="font-bold">Notifications</Dialog.Title>
                    <div className="flex items-center space-x-3">
                      <ToggleSwitch
                        checked={showUnread}
                        onChange={setShowUnread}
                        label="Unread"
                      />
                      <IconButton onClick={onClose} aria-label="Close notifications" variant="ghost">
                        <XMarkIcon className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </header>
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
                        itemCount={filtered.length}
                        itemSize={84}
                        width="100%"
                        overscanCount={3}
                      >
                        {({ index, style }: ListChildComponentProps) => {
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
                        }}
                      </List>
                    )}
                  </div>
                  <footer className="sticky bottom-0 z-10 px-4 py-3 bg-white border-t">
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="w-full rounded-full bg-red-500 py-2 text-sm font-medium text-white"
                    >
                      Clear All
                    </button>
                  </footer>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
