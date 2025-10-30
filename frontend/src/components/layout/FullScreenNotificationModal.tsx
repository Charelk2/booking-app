// FullScreenNotificationModal.tsx
'use client';

import { Fragment, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FixedSizeList } from 'react-window';
import NotificationCard from '../ui/NotificationCard';
import getNotificationDisplayProps from '@/hooks/getNotificationDisplayProps';
import type { UnifiedNotification } from '@/types';

interface FullScreenNotificationModalProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  error?: Error | string | null;
}

export default function FullScreenNotificationModal({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
  loadMore,
  hasMore,
  error,
}: FullScreenNotificationModalProps) {
  const router = useRouter();
  const ROW_HEIGHT = 84;
  const PAGE_SIZE = 10;

  // toggle unread filter
  const [showUnread, setShowUnread] = useState(false);
  // how many loaded into the list
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listRef = useRef<any>(null);
  const prevCountRef = useRef(visibleCount);

  // auto-scroll when loading more
  useEffect(() => {
    if (visibleCount > prevCountRef.current && listRef.current) {
      (listRef.current as any).scrollToItem?.(prevCountRef.current, 'start');
    }
    prevCountRef.current = visibleCount;
  }, [visibleCount]);

  // filter items by unread if toggled
  const filtered = showUnread
    ? items.filter((i) =>
        i.type === 'message' ? (i.unread_count ?? 0) > 0 : !i.is_read
      )
    : items;

  // slice out only what’s visible
  const visible = filtered.slice(0, visibleCount);
  const canLoadMore = hasMore && visibleCount < filtered.length;

  // build row count (notifications + optional load-more)
  const extraRow = canLoadMore ? 1 : 0;
  const totalRows = visible.length + extraRow;
  const rowsToShow = Math.min(totalRows, PAGE_SIZE + extraRow);
  const listHeight = rowsToShow * ROW_HEIGHT;

  // handle click + routing
  const handleItemClick = async (id: number) => {
    const item = items.find((i) => (i.id || i.booking_request_id) === id);
    if (!item) return;
    await onItemClick(id);

    if (item.link) {
      router.push(item.link);
    }
  };

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-50"
        open={open}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 hidden sm:block" />
        </Transition.Child>

        <Dialog.Panel className="flex h-full w-full flex-col bg-background">
          <div className="sticky top-0 z-20 flex items-center justify-between bg-background border-b px-4 py-3">
            <h2 className="text-lg font-semibold">Notifications</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUnread((p) => !p)}
                className="text-sm text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                data-testid="toggle-unread"
              >
                {showUnread ? 'Show All' : 'Unread Only'}
              </button>
              <button
                type="button"
                onClick={markAllRead}
                className="text-sm text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Mark All as Read
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="sr-only">Close panel</span>
                <XMarkIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 text-red-800 text-sm px-4 py-2" data-testid="notification-error">
              {typeof error === 'string' ? error : error.message}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4" data-testid="notification-modal-list">
            {visible.length === 0 && !canLoadMore ? (
              <div className="flex h-full items-center justify-center text-gray-500 text-center">
                🎉 You&apos;re all caught up!
              </div>
            ) : (
              <FixedSizeList
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
                      <div key={`${n.type}-${n.id || n.booking_request_id}`} style={style} className="rounded-lg">
                        <NotificationCard
                          {...props}
                          onClick={() =>
                            handleItemClick(n.id || (n.booking_request_id as number))
                          }
                        />
                      </div>
                    );
                  }
                  // Load more row
                  return (
                    <div style={style} className="text-center pt-2">
                      <button
                        type="button"
                        aria-label="Load more notifications"
                        onClick={() => {
                          setVisibleCount((c) => c + PAGE_SIZE);
                          loadMore();
                        }}
                        className="text-sm text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        Load more
                      </button>
                    </div>
                  );
                }}
              </FixedSizeList>
            )}
          </div>
        </Dialog.Panel>
      </Dialog>
    </Transition.Root>
  );
}
