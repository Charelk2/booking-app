'use client';

import { Fragment, useState } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import NavLink from './NavLink';
import { usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';
import BookingRequestIcon from './BookingRequestIcon';
import MobileMenuDrawer from './MobileMenuDrawer';
import MobileBottomNav from './MobileBottomNav';
import { HelpPrompt } from '../ui';

const baseNavigation = [
  { name: 'Home', href: '/' },
  { name: 'Artists', href: '/artists' },
  { name: 'Services', href: '/services' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contact', href: '/contact' },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = [...baseNavigation];
  if (user?.user_type === 'artist') {
    navigation.push(
      { name: 'Sound Providers', href: '/sound-providers' },
      { name: 'Quote Calculator', href: '/quote-calculator' },
      { name: 'Quote Templates', href: '/dashboard/profile/quote-templates' },
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 bg-gradient-to-b from-brand-light/50 to-gray-50">
      <Disclosure as="nav" className="bg-background shadow-sm">
        {() => (
          <>
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex h-16 justify-between">
                <div className="flex">
                  <div className="flex flex-shrink-0 items-center">
                    <Link href="/" className="text-xl font-bold text-brand-dark">
                      Artist Booking
                    </Link>
                  </div>
                  <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                    {navigation.map((item) => (
                      <NavLink
                        key={item.name}
                        href={item.href}
                        isActive={pathname === item.href}
                      >
                        {item.name}
                      </NavLink>
                    ))}
                  </div>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:items-center">
                  {user && <BookingRequestIcon />}
                  {user && <NotificationBell />}
                  {user ? (
                    <Menu as="div" className="relative ml-3">
                      <div>
                        <Menu.Button className="flex rounded-full bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2">
                          <span className="sr-only">Open user menu</span>
                          <div className="h-8 w-8 rounded-full bg-brand-light flex items-center justify-center">
                            <span className="text-brand-dark font-medium">
                              {user.first_name?.[0] || user.email[0]}
                            </span>
                          </div>
                        </Menu.Button>
                      </div>
                      <Transition
                        as={Fragment}
                        enter="transition ease-out duration-200"
                        enterFrom="transform opacity-0 scale-95"
                        enterTo="transform opacity-100 scale-100"
                        leave="transition ease-in duration-75"
                        leaveFrom="transform opacity-100 scale-100"
                        leaveTo="transform opacity-0 scale-95"
                      >
                        <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-background py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                href="/dashboard"
                                className={classNames(
                                  active ? 'bg-gray-100' : '',
                                  'block px-4 py-2 text-sm text-gray-700'
                                )}
                              >
                                Dashboard
                              </Link>
                            )}
                          </Menu.Item>
                          {user && user.user_type === 'artist' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/profile/edit"
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block px-4 py-2 text-sm text-gray-700'
                                  )}
                                >
                                  Edit Profile
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                          {user && user.user_type === 'artist' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/quotes"
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block px-4 py-2 text-sm text-gray-700'
                                  )}
                                >
                                  Quotes
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                          {user && user.user_type === 'artist' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/profile/quote-templates"
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block px-4 py-2 text-sm text-gray-700'
                                  )}
                                >
                                  Quote Templates
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                          {user && user.user_type === 'client' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/client/bookings"
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block px-4 py-2 text-sm text-gray-700'
                                  )}
                                >
                                  My Bookings
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                          {user && user.user_type === 'client' && (
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/client/quotes"
                                  className={classNames(
                                    active ? 'bg-gray-100' : '',
                                    'block px-4 py-2 text-sm text-gray-700'
                                  )}
                                >
                                  My Quotes
                                </Link>
                              )}
                            </Menu.Item>
                          )}
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                href="/account"
                                className={classNames(
                                  active ? 'bg-gray-100' : '',
                                  'block px-4 py-2 text-sm text-gray-700'
                                )}
                              >
                                Account
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <button
                                onClick={logout}
                                className={classNames(
                                  active ? 'bg-gray-100' : '',
                                  'block w-full text-left px-4 py-2 text-sm text-gray-700'
                                )}
                              >
                                Sign out
                              </button>
                            )}
                          </Menu.Item>
                        </Menu.Items>
                      </Transition>
                    </Menu>
                  ) : (
                    <div className="space-x-4">
                      <Link
                        href="/login"
                        className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/register"
                        className="bg-brand-dark text-white hover:bg-brand-dark px-3 py-2 rounded-md text-sm font-medium"
                      >
                        Sign up
                      </Link>
                    </div>
                  )}
                </div>
                <div className="flex items-center sm:hidden">
                  {user && <BookingRequestIcon />}
                  {user && <NotificationBell />}
                  <button
                    type="button"
                    onClick={() => setMenuOpen(true)}
                    className="-mr-2 ml-2 inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand"
                  >
                    <span className="sr-only">Open main menu</span>
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

          </>

        )}
      </Disclosure>
      <MobileMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
        user={user}
        logout={logout}
        pathname={pathname}
      />

      {/* bottom padding prevents content from being hidden behind the fixed bottom nav */}
      <main className="py-10 pb-24">
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
          {children}
        </div>
        <HelpPrompt className="mx-auto mt-10 max-w-7xl sm:px-6 lg:px-8" />
      </main>
      {user && <MobileBottomNav user={user} />}
    </div>
  );
}
