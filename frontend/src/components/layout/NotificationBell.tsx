'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import { BellIcon, ChatBubbleOvalLeftEllipsisIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import useNotifications from '@/hooks/useNotifications';
import type { Notification } from '@/types';

// TODO: load notifications incrementally (pagination or infinite scroll)

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function NotificationBell() {
  const { notifications, unreadCount, markRead } = useNotifications();
  const router = useRouter();

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await markRead(n.id);
    }
    router.push(n.link);
  };

  const markAllRead = async () => {
    await Promise.all(
      notifications.filter((n) => !n.is_read).map((n) => markRead(n.id)),
    );
  };

  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.type || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <Menu as="div" className="relative ml-3" aria-live="polite">
      <Menu.Button className="flex text-gray-400 hover:text-gray-600 focus:outline-none">
        <span className="sr-only">View notifications</span>
        <BellIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2 w-80 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 flex justify-end">
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-indigo-600 hover:underline focus:outline-none"
                aria-label="Mark all notifications read"
              >
                Mark all read
              </button>
            </div>
          )}
          {notifications.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
          )}
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="py-1">
              <p className="px-4 pt-2 text-xs font-semibold text-gray-500">
                {type === 'new_message' ? 'Messages' : type === 'booking_update' ? 'Bookings' : 'Other'}
              </p>
              {items.map((n) => (
                <Menu.Item key={n.id}>
                  {({ active }) => {
                    const Icon = n.type === 'new_message' ? ChatBubbleOvalLeftEllipsisIcon : CalendarIcon;
                    return (
                      <div
                        className={classNames(
                          active ? 'bg-gray-100' : '',
                          'flex w-full items-start px-4 py-2 text-sm gap-2'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleClick(n)}
                          className={classNames('flex-1 text-left', n.is_read ? 'text-gray-500' : 'font-medium')}
                        >
                          <span className="flex items-start gap-2">
                            <Icon className="h-4 w-4 mt-0.5" />
                            <span className="flex-1">{n.message}</span>
                          </span>
                          <span className="block text-xs text-gray-400">
                            {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="text-xs text-indigo-600 hover:underline ml-2"
                          aria-label={n.is_read ? 'Mark unread' : 'Mark read'}
                        >
                          {n.is_read ? 'Unread' : 'Read'}
                        </button>
                      </div>
                    );
                  }}
                </Menu.Item>
              ))}
            </div>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
