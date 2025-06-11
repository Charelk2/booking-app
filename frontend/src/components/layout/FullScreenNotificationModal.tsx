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

import type { UnifiedNotification } from '@/types';
import { parseItem } from './NotificationDrawer';

interface FullScreenNotificationModalProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}


export default function FullScreenNotificationModal({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
  loadMore,
  hasMore,
}: FullScreenNotificationModalProps) {
  const router = useRouter();
  const [showUnread, setShowUnread] = useState(false);
  const filtered = showUnread
    ? items.filter((i) =>
        i.type === 'message' ? (i.unread_count ?? 0) > 0 : !i.is_read,
      )
    : items;

  const handleItemClick = async (itemId: number) => {
    const item = items.find((i) => (i.id || i.booking_request_id) === itemId);
    if (!item) return;
    await onItemClick(itemId);
    if (item.type === 'message' && item.booking_request_id) {
      router.push(`/messages/thread/${item.booking_request_id}`);
    } else if (item.link) {
      router.push(item.link);
    }
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
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-500 text-center">
                🎉 You&apos;re all caught up!
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((n) => {
                  const parsed = parseItem(n);
                  return (
                    <div
                      key={`${n.type}-${n.id || n.booking_request_id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleItemClick(n.id || n.booking_request_id as number)}
                      onKeyPress={() => handleItemClick(n.id || n.booking_request_id as number)}
                      className={classNames(
                        'relative bg-white shadow rounded-lg p-4 flex flex-col space-y-2 transition hover:bg-gray-50 cursor-pointer',
                        n.is_read
                          ? 'border-l-4 border-transparent text-gray-500'
                          : 'border-l-4 border-indigo-500',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{parsed.title}</span>
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                          {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 truncate">{parsed.subtitle}</div>
                    </div>
                  );
                })}
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
