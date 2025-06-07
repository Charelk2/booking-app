'use client';

import Link from 'next/link';
import {
  HomeIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { User } from '@/types';
import useNotifications from '@/hooks/useNotifications';

interface MobileBottomNavProps {
  user: User | null;
  pathname: string;
}

interface Item {
  name: string;
  href: string;
  icon: (props: React.SVGProps<SVGSVGElement>) => JSX.Element;
  auth?: boolean;
}

const items: Item[] = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Artists', href: '/artists', icon: UsersIcon },
  { name: 'Messages', href: '/inbox', icon: ChatBubbleLeftRightIcon, auth: true },
  { name: 'Dashboard', href: '/dashboard', icon: UserCircleIcon, auth: true },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function MobileBottomNav({ user, pathname }: MobileBottomNavProps) {
  const { threads } = useNotifications();
  const unreadMessages = threads.reduce((acc, t) => acc + t.unread_count, 0);
  const badgeCount = unreadMessages > 99 ? '99+' : unreadMessages;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t shadow sm:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="flex justify-around">
        {items.map((item) => {
          if (item.auth && !user) return null;
          const active = pathname === item.href;
          const showBadge = item.name === 'Messages' && unreadMessages > 0;
          return (
            <li key={item.name} className="relative flex-1">
              <Link
                href={item.href}
                className={classNames(
                  'flex flex-col items-center text-xs',
                  active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <div className="min-w-[64px] min-h-[44px] flex flex-col items-center justify-center">
                  <div className="relative">
                    <item.icon className="h-6 w-6" aria-hidden="true" />
                    {showBadge && (
                      <span
                        className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full ring-2 ring-white"
                      >
                        {badgeCount}
                      </span>
                    )}
                  </div>
                  <span>{item.name}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

