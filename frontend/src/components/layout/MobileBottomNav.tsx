'use client';

import Link from 'next/link';
import { HomeIcon, UsersIcon, ChatBubbleLeftRightIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import type { User } from '@/types';

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
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t shadow sm:hidden"
      aria-label="Mobile navigation"
    >
      <ul className="flex justify-around">
        {items.map((item) => {
          if (item.auth && !user) return null;
          const active = pathname === item.href;
          return (
            <li key={item.name}>
              <Link
                href={item.href}
                className={classNames(
                  'flex flex-col items-center px-3 py-2 text-xs',
                  active ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <item.icon className="h-6 w-6" aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

