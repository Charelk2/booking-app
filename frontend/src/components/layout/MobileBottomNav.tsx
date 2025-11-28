'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ChatBubbleLeftRightIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { User } from '@/types';
// Import directly from TSX implementation to avoid potential TDZ
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import useScrollDirection from '@/hooks/useScrollDirection';
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
  const pathname = usePathname();
  const { count: unreadThreadsCount } = useUnreadThreadsCount();
  const scrollDir = useScrollDirection();
  const navRef = useRef<HTMLElement>(null);

  // Expose nav height + offset for other fixed elements
  useEffect(() => {
    const updateVars = () => {
      const height = navRef.current?.offsetHeight ?? 56;
      document.documentElement.style.setProperty('--mobile-bottom-nav-height', `${height}px`);
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

  if (!user) return null;

  const navItems: Item[] = [
    { name: 'Home', href: '/', icon: HomeIcon },
    { name: 'Messages', href: '/inbox', icon: ChatBubbleLeftRightIcon, auth: true },
    {
      name: 'Dashboard',
      href: user.user_type === 'service_provider' ? '/dashboard/artist' : '/dashboard/client',
      icon: UserCircleIcon,
      auth: true,
    },
  ];

  const unreadMessages = unreadThreadsCount;
  const badgeCount = unreadMessages > 99 ? '99+' : String(unreadMessages);

  return (
    <nav
      ref={navRef}
      className={clsx(
        // container
        'fixed inset-x-0 bottom-0 z-50 sm:hidden',
        // visual style (subtle glass)
        'bg-white/85 backdrop-blur supports-[backdrop-filter]:backdrop-blur-md',
        'border-t border-black/5 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]',
        // sizing + safe area
        'h-14 pt-1',
        'pb-[max(env(safe-area-inset-bottom,0),0.25rem)]',
        // show/hide on scroll
        'transition-transform duration-200',
        scrollDir === 'down' ? 'translate-y-full pointer-events-none' : 'translate-y-0 pointer-events-auto',
      )}
      aria-label="Mobile navigation"
    >
      {/* 3 equal columns; prevents uneven spacing */}
      <ul className="grid grid-cols-3 h-full">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const showBadge = item.name === 'Messages' && unreadMessages > 0;

          return (
            <li key={item.name} className="min-w-0">
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                aria-label={item.name}
                className={clsx(
                  // full-height tap target, centered
                  'flex h-full flex-col items-center justify-center gap-1',
                  // neutralize any inherited paddings/margins from shared link styles
                  '!p-0 !m-0',
                  // typography
                  'text-[11px] font-medium tracking-tight',
                  'no-underline hover:no-underline',
                  active ? 'text-slate-900' : 'text-slate-600 hover:text-slate-800',
                )}
              >
                <span className="relative inline-flex items-center justify-center">
                  <item.icon
                    className={clsx(
                      'h-6 w-6 shrink-0',
                      active ? 'stroke-[1.8] text-slate-900' : 'stroke-[1.6] text-slate-700',
                    )}
                    aria-hidden="true"
                  />
                  {showBadge && (
                    <span
                      className={clsx(
                        'absolute -top-1 -right-1',
                        'inline-flex min-w-[18px] h-[18px] items-center justify-center',
                        'rounded-full px-1.5 text-[10px] font-bold leading-none',
                        'text-white bg-red-600 ring-2 ring-white',
                      )}
                    >
                      {badgeCount}
                    </span>
                  )}
                </span>
                <span className="leading-none">{item.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
