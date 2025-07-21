'use client';

import { Fragment, useState, ComponentProps } from 'react';
import { Disclosure, Menu, Transition } from '@headlessui/react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import NavLink from './NavLink';
import NotificationBell from './NotificationBell';
import BookingRequestIcon from './BookingRequestIcon';
import MobileMenuDrawer from './MobileMenuDrawer';
import MobileBottomNav from './MobileBottomNav';
import { HelpPrompt, Avatar } from '../ui';
import Hero from './Hero';

// --- CONSTANTS ---
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

// --- FOOTER COMPONENT (Defined within MainLayout) ---
const SocialIcon = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} className="text-gray-400 hover:text-gray-500">
    <span className="sr-only">{children}</span>
    {children}
  </a>
);

const FacebookIcon = (props: ComponentProps<'svg'>) => (
  <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
    <path
      fillRule="evenodd"
      d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
      clipRule="evenodd"
    />
  </svg>
);

const Footer = () => (
  <footer className="bg-gradient-to-t from-brand-light/50 to-gray-50 border-t border-gray-200">
    <div className="mx-auto max-w-7xl px-6 py-10 text-left">
      {/* nav links */}
      <nav className="flex flex-wrap gap-x-8 gap-y-4 justify-center">
        {baseNavigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="text-sm font-medium text-gray-600 hover:text-brand-dark transition"
          >
            {item.name}
          </Link>
        ))}
      </nav>

      {/* social icons */}
      <div className="mt-8 flex justify-center space-x-6">
        <SocialIcon href="https://facebook.com">
          <FacebookIcon className="h-6 w-6 text-gray-500 hover:text-brand-dark transition" />
        </SocialIcon>
      </div>

      {/* copyright */}
      <p className="mt-8 text-center text-xs text-gray-500">
        &copy; {new Date().getFullYear()} Booka.co.za. All rights reserved.
      </p>
    </div>
  </footer>
);

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const showOldContent = false; // Toggle for old page content

  const navigation = [...baseNavigation];
  if (user?.user_type === 'artist') {
    navigation.push(
      { name: 'Sound Providers', href: '/sound-providers' },
      { name: 'Quote Calculator', href: '/quote-calculator' },
      { name: 'Quote Templates', href: '/dashboard/profile/quote-templates' }
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 bg-gradient-to-b from-brand-light/50 to-gray-50">
      <div className="flex-grow">
        {/* NAV BAR */}
        <Disclosure as="nav" className="bg-background shadow-sm">
          {() => (
            <>
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 justify-between">
                  {/* Logo + Links */}
                  <div className="flex">
                    <Link
                      href="/"
                      className="flex shrink-0 items-center text-xl font-bold text-brand-dark"
                    >
                      Booka.co.za
                    </Link>
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

                  {/* Desktop Right */}
                  <div className="hidden sm:ml-6 sm:flex sm:items-center">
                    {user ? (
                      <>
                        <BookingRequestIcon />
                        <NotificationBell />
                        <Menu as="div" className="relative ml-3">
                          <div>
                            <Menu.Button className="flex rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2">
                              <span className="sr-only">Open user menu</span>
                              <Avatar
                                src={user.profile_picture_url || null}
                                initials={user.first_name?.[0] || user.email[0]}
                                size={32}
                              />
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

                              {user.user_type === 'artist' && (
                                <>
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
                                </>
                              )}

                              {user.user_type === 'client' && (
                                <>
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
                                </>
                              )}

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
                      </>
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

                  {/* Mobile menu button */}
                  <div className="flex items-center sm:hidden">
                    {user && <BookingRequestIcon />}
                    {user && <NotificationBell />}
                    <button
                      onClick={() => setMenuOpen(true)}
                      className="-mr-2 ml-2 inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand"
                    >
                      <span className="sr-only">Open main menu</span>
                      <Bars3Icon className="h-6 w-6" aria-hidden="true" />
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

        {/* HERO only on home */}
        {pathname === '/' && <Hero />}

        {/* CONTENT */}
        {pathname === '/' ? (
          showOldContent ? (
            <main className="py-10 pb-24">
              <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">{children}</div>
              <HelpPrompt className="mx-auto mt-10 max-w-7xl sm:px-6 lg:px-8" />
            </main>
          ) : null
        ) : (
          <main className="py-10 pb-24">
            <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">{children}</div>
            <HelpPrompt className="mx-auto mt-10 max-w-7xl sm:px-6 lg:px-8" />
          </main>
        )}
      </div>

      {/* RENDER THE FOOTER HERE */}
      <Footer />

      {user && <MobileBottomNav user={user} />}
    </div>
  );
}
