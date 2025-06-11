'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { getFullImageUrl } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { UnifiedNotification } from '@/types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  items: UnifiedNotification[];
  onItemClick: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export interface ParsedNotification {
  title: string;
  subtitle: string;
  icon: string;
  avatarUrl?: string | null;
  initials?: string;
}

export function parseItem(n: UnifiedNotification): ParsedNotification {
  if (n.type === 'message') {
    const cleaned = n.content.replace(/^New message:\s*/i, '').trim();
    const snippet = cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned;
    const titleRaw =
      n.unread_count && n.unread_count > 0
        ? `${n.name} (${n.unread_count})`
        : n.name || '';
    const title =
      titleRaw.length > 36 ? `${titleRaw.slice(0, 36)}...` : titleRaw;
    return {
      title,
      subtitle: `Last message: "${snippet}"`,
      icon: '💬',
      avatarUrl: n.avatar_url || undefined,
      initials: n.name
        ? n.name
            .split(' ')
            .map((w) => w[0])
            .join('')
        : undefined,
    };
  }
  if (n.type === 'new_booking_request') {
    let sender = n.sender_name;
    let btype = n.booking_type;
    if (!sender || !btype) {
      const match = n.content.match(
        /New booking request from (.+?)(?::| - | for )\s*(.+)/i,
      );
      if (match) {
        sender = sender || match[1];
        btype = btype || match[2];
      }
    }
    const iconMap: Record<string, string> = {
      video: '🎥',
      song: '🎵',
    };
    const iconKey = btype ? btype.toLowerCase() : '';
    const icon = iconKey.includes('video')
      ? iconMap.video
      : iconKey.includes('song')
        ? iconMap.song
        : '📅';
    let formattedType = btype || '';
    if (formattedType) {
      formattedType = formattedType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const subtitleBase = formattedType
      ? `sent a booking for ${formattedType}`
      : 'Booking Request';
    const subtitle =
      subtitleBase.length > 30 ? `${subtitleBase.slice(0, 30)}...` : subtitleBase;
    const titleRaw = sender || 'New booking request';
    const title = titleRaw.length > 36 ? `${titleRaw.slice(0, 36)}...` : titleRaw;
    return {
      title,
      subtitle,
      icon,
    };
  }
  if (/quote accepted/i.test(n.content)) {
    const match = n.content.match(/Quote accepted by (.+)/i);
    const rawTitle = match ? `Quote accepted by ${match[1]}` : 'Quote accepted';
    const title = rawTitle.length > 36 ? `${rawTitle.slice(0, 36)}...` : rawTitle;
    const subtitle = n.content.length > 30 ? `${n.content.slice(0, 30)}...` : n.content;
    return {
      title,
      subtitle,
      icon: '✅',
    };
  }
  const defaultTitle = n.content.length > 36 ? `${n.content.slice(0, 36)}...` : n.content;
  return { title: defaultTitle, subtitle: '', icon: '🔔' };
}

function DrawerItem({ n, onClick }: { n: UnifiedNotification; onClick: () => void }) {
  const parsed = parseItem(n);
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'group flex w-full items-start px-4 py-3 text-base gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 hover:bg-gray-50 rounded shadow-sm transition',
        n.is_read
          ? 'border-b last:border-b-0 border-l-4 border-transparent bg-gray-50 text-gray-500'
          : 'border-l-4 border-indigo-500 bg-white text-gray-900 font-medium',
      )}
    >
      {parsed.avatarUrl || parsed.initials ? (
        parsed.avatarUrl ? (
          <Image
            src={getFullImageUrl(parsed.avatarUrl) as string}
            alt="avatar"
            width={40}
            height={40}
            className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
            {parsed.initials}
          </div>
        )
      ) : (
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
          {parsed.icon}
        </div>
      )}
      <div className="flex-1 text-left">
        <div className="flex items-start justify-between">
          <span className="font-medium text-gray-900 truncate whitespace-nowrap overflow-hidden">{parsed.title}</span>
          <span className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
          </span>
        </div>
        <span className="block text-sm text-gray-700 truncate whitespace-nowrap overflow-hidden">{parsed.subtitle}</span>
      </div>
    </button>
  );
}

export default function NotificationDrawer({
  open,
  onClose,
  items,
  onItemClick,
  markAllRead,
  loadMore,
  hasMore,
}: NotificationDrawerProps) {
  const [showUnread, setShowUnread] = useState(false);
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
                    {filtered.length === 0 && (
                      <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
                    )}
                    {filtered.map((n) => (
                      <DrawerItem key={`${n.type}-${n.id || n.booking_request_id}`} n={n} onClick={() => onItemClick(n.id || n.booking_request_id as number)} />
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
