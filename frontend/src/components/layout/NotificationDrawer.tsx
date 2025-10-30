// NotificationDrawer.tsx
'use client';

import { Fragment, useState, useRef, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { FixedSizeList as RWFixedSizeList } from 'react-window';
import NotificationCard from '../ui/NotificationCard';
import getNotificationDisplayProps from '@/hooks/getNotificationDisplayProps';
import { ToggleSwitch, IconButton } from '../ui';
import type { UnifiedNotification } from '@/types';
import { BREAKPOINT_SM } from '@/lib/breakpoints';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  error?: Error | string | null;
}

const panelVariants = {
  hidden: { x: '100%', scale: 0.95, opacity: 0 },
  visible: { x: 0, scale: 1, opacity: 1 },
  exit: { x: '100%', scale: 0.95, opacity: 0 },
};

export default function NotificationDrawer({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
  error,
}: NotificationDrawerProps) {
  const ROW_HEIGHT = 72;

  // responsive PAGE_SIZE: 3 rows on small (<BREAKPOINT_SM), else 5
  const getPageSize = () => (window.innerWidth < BREAKPOINT_SM ? 3 : 5);
  const [pageSize, setPageSize] = useState(getPageSize);

  // update pageSize on window resize
  useEffect(() => {
    const onResize = () => setPageSize(getPageSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [showUnread, setShowUnread] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const listRef = useRef<any>(null);
  const prevCountRef = useRef(visibleCount);

  // clamp visibleCount when pageSize changes
  useEffect(() => {
    setVisibleCount((c) => Math.min(c, pageSize));
  }, [pageSize]);

  // auto-scroll when loading more
  useEffect(() => {
    if (visibleCount > prevCountRef.current && listRef.current) {
      (listRef.current as any).scrollToItem?.(prevCountRef.current, 'start');
    }
    prevCountRef.current = visibleCount;
  }, [visibleCount]);

  // filter & paginate
  const filtered = showUnread
    ? items.filter(i =>
        i.type === 'message'
          ? (i.unread_count ?? 0) > 0
          : !i.is_read
      )
    : items;
  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = visibleCount < filtered.length;

  // build list rows (notifications + optional Load More)
  const extraRow = canLoadMore ? 1 : 0;
  const totalRows = visible.length + extraRow;
  const rowsToShow = Math.min(totalRows, pageSize + extraRow);
  const listHeight = rowsToShow * ROW_HEIGHT;

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        open={open}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-80"
          leave="ease-in duration-100"
          leaveFrom="opacity-80"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-xs transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-6">
              <Transition.Child as={Fragment} enter="duration-180" leave="duration-120">
                <Dialog.Panel
                  as={motion.div}
                  variants={panelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                  className="pointer-events-auto rounded-l-2xl bg-white bg-opacity-100 backdrop-filter backdrop-saturate-125 backdrop-brightness-110 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-sm sm:w-64 md:w-[360px] lg:w-[400px] border-l border-gray-200"
                >
                  <header className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-indigo-50 to-white border-b">
                    <Dialog.Title className="font-semibold text-lg text-gray-800">
                      Notifications
                    </Dialog.Title>
                    <div className="flex items-center space-x-2">
                      <ToggleSwitch checked={showUnread} onChange={setShowUnread} label="Unread" />
                      <IconButton onClick={onClose} aria-label="Close" variant="ghost">
                        <XMarkIcon className="h-5 w-5 text-gray-600 hover:text-gray-800 transition-colors" />
                      </IconButton>
                    </div>
                  </header>

                  {error && (
                    <div className="bg-red-100 text-red-800 text-xs px-3 py-1" data-testid="notification-error">
                      {typeof error === 'string' ? error : error.message}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto py-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent" data-testid="notification-list">
                    {visible.length === 0 && (
                      <div className="px-3 py-2 text-center text-xs text-gray-500 italic">
                        No notifications
                      </div>
                    )}

                    <RWFixedSizeList
                      ref={listRef}
                      height={listHeight}
                      itemCount={totalRows}
                      itemSize={ROW_HEIGHT}
                      width="100%"
                      overscanCount={3}
                    >
                      {({ index, style }: { index: number; style: React.CSSProperties }) => {
                        if (index < visible.length) {
                          const n = visible[index];
                          const props = getNotificationDisplayProps(n);
                          return (
                            <div
                              style={style}
                              className="px-3 hover:bg-gray-50 transition-colors duration-150 rounded"
                            >
                              <NotificationCard
                                {...props}
                                onClick={() =>
                                  onItemClick(
                                    n.id ?? (n.booking_request_id as number)
                                  )
                                }
                              />
                            </div>
                          );
                        }
                        return (
                          <div
                            style={style}
                            className="flex items-center justify-center hover:bg-gray-50 transition-colors duration-150"
                          >
                            <button
                              type="button"
                              onClick={() => setVisibleCount(c => c + pageSize)}
                              className="flex items-center justify-center min-h-[44px] min-w-[44px] text-indigo-600 text-sm font-medium"
                            >
                              Load more
                            </button>
                          </div>
                        );
                      }}
                    </RWFixedSizeList>
                  </div>

                  <footer className="sticky bottom-0 z-10 px-3 py-2 bg-white bg-opacity-90 backdrop-filter backdrop-blur-xs border-t flex gap-2">
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="w-full rounded-full bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-transform py-1 text-xs font-medium text-white shadow-lg"
                    >
                      Mark All Read
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
