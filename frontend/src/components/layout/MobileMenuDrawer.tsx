'use client';

import { Fragment, type ComponentType, type SVGProps, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { User } from '@/types';
import NavLink from './NavLink';
import { navItemClasses } from './navStyles';
import Avatar from '../ui/Avatar';

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
    if (user.user_type === 'service_provider') {
      return [
        { name: 'Dashboard', href: '/dashboard/artist' },
        { name: 'Edit Profile', href: '/dashboard/profile/edit' },
        { name: 'Messages', href: '/inbox' },
      ];
    }
    // client
    return [
      { name: 'Events', href: '/dashboard/client' },
      { name: 'Messages', href: '/inbox' },
      { name: 'Edit Profile', href: '/account' },
    ];
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
      <Dialog
        as="div"
        className="relative z-50"
        open={open}
        onClose={onClose}
      >
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
                {navigation.length > 0 && (
                  <NavigationSection
                    title="Explore"
                    items={navigation}
                    onClose={onClose}
                    pathname={pathname}
                  />
                )}
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
                  {/* Signed-in identity summary */}
                  {user && (
                    <div className="flex items-center gap-3 px-2 pb-3">
                      <Avatar
                        src={user.profile_picture_url || null}
                        initials={(user.first_name || user.email || 'U')[0]}
                        size={40}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {user.first_name || user.email?.split('@')[0] || 'Account'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                  )}

                  <ul className="space-y-1">
                    {accountLinks.map((item) => (
                      <li key={item.name}>
                        <NavLink
                          href={item.href}
                          onClick={onClose}
                          isActive={pathname === item.href}
                          className="w-full border-l-4 text-base justify-start gap-3 px-2 py-2 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <span>{item.name}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>

                  {/* Emphasized destructive section */}
                  {user && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={() => {
                          logout();
                          onClose();
                        }}
                        className={clsx(
                          navItemClasses,
                          'w-full text-left text-base text-red-600 hover:bg-red-50 px-2 py-2 rounded-md justify-start',
                        )}
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </nav>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
