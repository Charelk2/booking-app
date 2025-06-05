'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Transition } from '@headlessui/react';
import { BellIcon, ChatBubbleOvalLeftEllipsisIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import useNotifications from '@/hooks/useNotifications';
import type { Notification } from '@/types';

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

  return (
    <Menu as="div" className="relative ml-3">
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
          {notifications.length === 0 && (
            <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
          )}
          {notifications.map((n) => (
            <Menu.Item key={n.id}>
              {({ active }) => {
                const Icon = n.type === 'new_message' ? ChatBubbleOvalLeftEllipsisIcon : CalendarIcon;
                return (
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={classNames(
                      active ? 'bg-gray-100' : '',
                      'flex w-full items-start text-left px-4 py-2 text-sm gap-2',
                      n.is_read ? 'text-gray-500' : 'font-medium'
                    )}
                  >
                    <Icon className="h-4 w-4 mt-0.5" />
                    <span className="flex-1">{n.message}</span>
                    <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}</span>
                  </button>
                );
              }}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
