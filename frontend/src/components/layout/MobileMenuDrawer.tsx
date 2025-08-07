'use client';

import { Fragment, type ComponentType, type SVGProps, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { User } from '@/types';
import NavLink from './NavLink';
import { navItemClasses } from './navStyles';

interface NavItem {
  name: string;
  href: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  navigation: NavItem[];
  secondaryNavigation?: NavItem[];
  user: User | null;
  logout: () => void;
  pathname: string;
}

const useMobileNavItems = (user: User | null): NavItem[] => {
  return useMemo(() => {
    if (!user) {
      return [
        { name: 'Sign in', href: '/login' },
        { name: 'Sign up', href: '/register' },
      ];
    }
    const accountLinks: NavItem[] = [
      {
        name: 'Dashboard',
        href: user.user_type === 'artist' ? '/dashboard/artist' : '/dashboard/client',
      },
      { name: 'Sign out', href: '#' },
    ];
    if (user.user_type === 'artist') {
      accountLinks.splice(1, 0,
        { name: 'Edit Profile', href: '/dashboard/profile/edit' },
        { name: 'Quotes', href: '/dashboard/quotes' },
        { name: 'Quote Templates', href: '/dashboard/profile/quote-templates' }
      );
    } else if (user.user_type === 'client') {
      accountLinks.splice(1, 0,
        { name: 'My Bookings', href: '/dashboard/client/bookings' },
        { name: 'My Quotes', href: '/dashboard/client/quotes' },
        { name: 'Account', href: '/account' }
      );
    }
    return accountLinks;
  }, [user]);
};

interface NavigationSectionProps {
  title: string;
  items: NavItem[];
  onClose: () => void;
  pathname: string;
}

const NavigationSection = ({ title, items, onClose, pathname }: NavigationSectionProps) => (
  <nav aria-label={title} className="mt-4 px-2">
    <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase sr-only">
      {title}
    </h3>
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.name}>
          <NavLink
            href={item.href}
            onClick={onClose}
            isActive={pathname === item.href}
            className="w-full border-l-4 text-base justify-start gap-3 px-2 py-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            {item.icon && (
              <item.icon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            )}
            <span>{item.name}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default function MobileMenuDrawer({
  open,
  onClose,
  navigation,
  secondaryNavigation = [],
  user,
  logout,
  pathname,
}: MobileMenuDrawerProps) {
  const accountLinks = useMobileNavItems(user);
  const extraNavigation = secondaryNavigation.filter(
    (item) => !navigation.some((nav) => nav.href === item.href),
  );
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
          <div className="fixed inset-0 bg-gray-900/80 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 flex">
          <Transition.Child
            as={Fragment}
            enter="transform transition ease-in-out duration-300"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transform transition ease-in-out duration-300"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <Dialog.Panel
              className="relative flex w-full max-w-xs flex-1 flex-col bg-white overflow-y-auto pt-safe pb-safe shadow-xl"
              style={{
                paddingBottom:
                  'calc(var(--mobile-bottom-nav-height, 0px) + env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex items-center px-4 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className={clsx(
                    navItemClasses,
                    'p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  )}
                >
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
                <Dialog.Title className="ml-2 text-xl font-bold text-gray-900">
                  Menu
                </Dialog.Title>
              </div>
              <div className="flex-1 px-2">
                <NavigationSection
                  title="Explore"
                  items={navigation}
                  onClose={onClose}
                  pathname={pathname}
                />
                {extraNavigation.length > 0 && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <NavigationSection
                      title="More"
                      items={extraNavigation}
                      onClose={onClose}
                      pathname={pathname}
                    />
                  </div>
                )}
              </div>
              <div className="mt-auto border-t border-gray-200 pt-4 px-2">
                <nav aria-label="Account" className="pb-safe">
                  <ul className="space-y-1">
                    {accountLinks.map((item) => (
                      <li key={item.name}>
                        {item.name === 'Sign out' ? (
                          <button
                            type="button"
                            onClick={() => {
                              logout();
                              onClose();
                            }}
                            className={clsx(
                              navItemClasses,
                              'w-full text-left text-base text-gray-700 hover:bg-gray-100 hover:text-red-600 px-2 py-2 rounded-md',
                            )}
                          >
                            Sign out
                          </button>
                        ) : (
                          <NavLink
                            href={item.href}
                            onClick={onClose}
                            isActive={pathname === item.href}
                            className="w-full border-l-4 text-base justify-start gap-3 px-2 py-2 rounded-md hover:bg-gray-100 transition-colors"
                          >
                            <span>{item.name}</span>
                          </NavLink>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}