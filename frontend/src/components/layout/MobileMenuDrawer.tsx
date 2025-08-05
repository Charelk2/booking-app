'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import type { User } from '@/types';
import NavLink from './NavLink';
import { navItemClasses } from './navStyles';

interface NavItem {
  name: string;
  href: string;
}

interface MobileMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  navigation: NavItem[];
  /**
   * Optional additional navigation items. Any links that duplicate the main
   * `navigation` list are filtered out to avoid confusion in the drawer.
   */
  secondaryNavigation?: NavItem[];
  user: User | null;
  logout: () => void;
  pathname: string;
}

export default function MobileMenuDrawer({
  open,
  onClose,
  navigation,
  secondaryNavigation = [],
  user,
  logout,
  pathname,
}: MobileMenuDrawerProps) {
  // Remove duplicates so the same link never appears twice
  const extraNavigation = secondaryNavigation.filter(
    (item) => !navigation.some((nav) => nav.href === item.href),
  );
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-40" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
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
            <Dialog.Panel className="relative flex w-full max-w-xs flex-col bg-background pb-4 shadow-xl">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="text-lg font-medium">Menu</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className={clsx(
                    navItemClasses,
                    'rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  )}
                >
                  <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 px-2">
                <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase">Explore</h3>
                <div className="mt-2 space-y-1">
                  {navigation.map((item) => (
                    <NavLink
                      key={item.name}
                      href={item.href}
                      onClick={onClose}
                      isActive={pathname === item.href}
                      className="block border-l-4 text-base"
                    >
                      {item.name}
                    </NavLink>
                  ))}
                </div>
              </div>
              {extraNavigation.length > 0 && (
                <div className="mt-4 border-t border-gray-200 pt-4 px-2">
                  <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase">More</h3>
                  <div className="mt-2 space-y-1">
                    {extraNavigation.map((item) => (
                      <NavLink
                        key={item.name}
                        href={item.href}
                        onClick={onClose}
                        isActive={pathname === item.href}
                        className="block border-l-4 text-base"
                      >
                        {item.name}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 border-t border-gray-200 pt-4 px-2">
                <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase">Account</h3>
                {user ? (
                  <>
                    <NavLink
                      href={user.user_type === 'artist' ? '/dashboard/artist' : '/dashboard/client'}
                      onClick={onClose}
                      className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Dashboard
                    </NavLink>
                    {user.user_type === 'artist' && (
                      <NavLink
                        href="/dashboard/profile/edit"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Edit Profile
                      </NavLink>
                    )}
                    {user.user_type === 'artist' && (
                      <NavLink
                        href="/dashboard/quotes"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Quotes
                      </NavLink>
                    )}
                    {user.user_type === 'artist' && (
                      <NavLink
                        href="/dashboard/profile/quote-templates"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Quote Templates
                      </NavLink>
                    )}
                    {user.user_type === 'client' && (
                      <NavLink
                        href="/dashboard/client/bookings"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        My Bookings
                      </NavLink>
                    )}
                    {user.user_type === 'client' && (
                      <NavLink
                        href="/dashboard/client/quotes"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        My Quotes
                      </NavLink>
                    )}
                    {user.user_type === 'client' && (
                      <NavLink
                        href="/account"
                        onClick={onClose}
                        className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      >
                        Account
                      </NavLink>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        onClose();
                      }}
                      className={clsx(
                        navItemClasses,
                        'block w-full text-left text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <NavLink
                      href="/login"
                      onClick={onClose}
                      className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign in
                    </NavLink>
                    <NavLink
                      href="/register"
                      onClick={onClose}
                      className="block text-base text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    >
                      Sign up
                    </NavLink>
                  </>
                )}
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
