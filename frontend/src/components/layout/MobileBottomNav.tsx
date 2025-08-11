'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  HomeIcon,
  UsersIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { User } from '@/types';
import useNotifications from '@/hooks/useNotifications';
import type { UnifiedNotification } from '@/types';
import useScrollDirection from '@/hooks/useScrollDirection';
import NavLink from './NavLink';
import { navItemClasses } from './navStyles';
import clsx from 'clsx';

interface MobileBottomNavProps {
  user: User | null;
}

interface Item {
  name: string;
  href: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  auth?: boolean;
}

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const router = useRouter();
  const { items } = useNotifications();
  const notificationItems = items;
  const scrollDir = useScrollDirection();
  const navRef = useRef<HTMLElement>(null);

  // Expose the nav's actual height via CSS vars and a dynamic offset that
  // becomes 0 when the nav is hidden (scrolling down), so composers can slide down.
  useEffect(() => {
    const updateVars = () => {
      const height = navRef.current?.offsetHeight ?? 56;
      document.documentElement.style.setProperty(
        '--mobile-bottom-nav-height',
        `${height}px`,
      );
      document.documentElement.style.setProperty(
        '--mobile-bottom-nav-offset',
        scrollDir === 'down' ? '0px' : `${height}px`,
      );
    };
    updateVars();
    window.addEventListener('resize', updateVars);
    return () => {
      window.removeEventListener('resize', updateVars);
      document.documentElement.style.removeProperty('--mobile-bottom-nav-height');
      document.documentElement.style.removeProperty('--mobile-bottom-nav-offset');
    };
  }, [scrollDir]);
  const navItems: Item[] = [
    { name: 'Home', href: '/', icon: HomeIcon },
    { name: 'Service Providers', href: '/service-providers', icon: UsersIcon },
    { name: 'Messages', href: '/inbox', icon: ChatBubbleLeftRightIcon, auth: true },
    {
      name: 'Dashboard',
      href: user?.user_type === 'service_provider' ? '/dashboard/artist' : '/dashboard/client',
      icon: UserCircleIcon,
      auth: true,
    },
  ];
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
      ref={navRef}
      className={clsx(
        'fixed bottom-0 w-full h-[56px] py-1 bg-background border-t shadow z-50 sm:hidden transition-transform pb-safe',
        scrollDir === 'down' ? 'translate-y-full pointer-events-none' : 'translate-y-0 pointer-events-auto',
      )}
      aria-label="Mobile navigation"
    >
      <ul className="flex justify-around h-full">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const showBadge = item.name === 'Messages' && unreadMessages > 0;

          return (
            <li key={item.name} className="flex-1">
              <NavLink
                href={item.href}
                isActive={active}
                aria-current={active ? 'page' : undefined}
                aria-label={item.name}
                className={clsx(
                  navItemClasses,
                  'flex flex-col items-center justify-center gap-1 h-full',
                  active
                    ? 'text-brand-dark border-brand-dark'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
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
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
