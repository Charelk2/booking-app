'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HomeIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { User } from '@/types';
import useNotifications from '@/hooks/useNotifications';
import { toUnifiedFromNotification } from '@/hooks/notificationUtils';
import type { UnifiedNotification } from '@/types';
import useScrollDirection from '@/hooks/useScrollDirection';

interface MobileBottomNavProps {
  user: User | null;
}

interface Item {
  name: string;
  href: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  auth?: boolean;
}

const navItems: Item[] = [
  { name: 'Home', href: '/', icon: HomeIcon },
  { name: 'Artists', href: '/artists', icon: UsersIcon },
  { name: 'Messages', href: '/inbox', icon: ChatBubbleLeftRightIcon, auth: true },
  { name: 'Dashboard', href: '/dashboard', icon: UserCircleIcon, auth: true },
];

function classNames(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const router = useRouter();
  const { items } = useNotifications();
  const notificationItems = items;
  const scrollDir = useScrollDirection();
  if (!user) {
    return null;
  }
  // Next.js App Router doesn’t expose pathname in its types, so we use a type assertion
  const pathname = (router as unknown as { pathname?: string }).pathname || '';
  const unreadMessages = notificationItems
    .filter((i: UnifiedNotification) => i.type === 'message')
    .reduce((sum, t: UnifiedNotification) => sum + (t.unread_count || 0), 0);
  const badgeCount = unreadMessages > 99 ? '99+' : String(unreadMessages);

  return (
    <nav
      className={classNames(
        'fixed bottom-0 w-full h-[56px] py-1 bg-background border-t shadow z-50 sm:hidden transition-transform',
        scrollDir === 'down' ? 'translate-y-full' : 'translate-y-0',
      )}
      aria-label="Mobile navigation"
    >
      <ul className="flex justify-around h-full">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const showBadge = item.name === 'Messages' && unreadMessages > 0;

          return (
            <li key={item.name} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={classNames(
                  'flex flex-col items-center justify-center gap-1 py-0.5 transition-colors no-underline hover:no-underline',
                  active
                    ? 'text-brand-dark border-b-2 border-brand-dark'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <div className="flex flex-col items-center space-y-0.5">
                  <div className="relative flex items-center justify-center">
                    <item.icon className="h-6 w-6" aria-hidden="true" />
                    {showBadge && (
                      <span
                        className="absolute top-0 right-0 inline-flex translate-x-1/2 -translate-y-1/2 items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full ring-2 ring-white"
                      >
                        {badgeCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px]">{item.name}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
