'use client';

import { useState, useCallback, Fragment, ReactNode } from 'react';
import { Menu, Transition } from '@headlessui/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import NotificationBell from './NotificationBell';
import BookingRequestIcon from './BookingRequestIcon';
import MobileMenuDrawer from './MobileMenuDrawer';
import SearchBarCompact from '../search/SearchBarCompact';
import SearchBarExpanded from '../search/SearchBarExpanded';
import { UI_CATEGORY_TO_SERVICE } from '@/lib/categoryMap';
import { Avatar } from '../ui';
import clsx from 'clsx';
import { type Category } from '../search/SearchFields';

type SearchParams = {
  category?: string;
  location?: string;
  when?: Date | null;
};

const clientNav = [
  { name: 'Artists', href: '/artists' },
  { name: 'Services', href: '/services' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Contact', href: '/contact' },
];

interface HeaderProps {
  extraBar?: ReactNode;
  isCompact?: boolean;
  onForceHeaderExpand?: () => void;
}

export default function Header({ extraBar, isCompact = false, onForceHeaderExpand }: HeaderProps) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Category is currently fixed; setter intentionally omitted
  const [category] = useState<Category | null>(null);
  const [location, setLocation] = useState<string>('');
  const [when, setWhen] = useState<Date | null>(null);
  // Controls whether the expanded search overlay is visible
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSearch = useCallback(
    ({ category, location, when }: SearchParams) => {
      const params = new URLSearchParams();
      if (category) params.set('category', UI_CATEGORY_TO_SERVICE[category] || category);
      if (location) params.set('location', location);
      if (when) params.set('when', when.toISOString());
      router.push(`/artists?${params.toString()}`);
      setIsExpanded(false);
    },
    [router]
  );

  const isHeaderFullyExpanded = !isCompact || isExpanded;

  const headerClasses = clsx(
    "sticky top-0 z-40 bg-white transition-all duration-300 ease-in-out",
    {
      "shadow-md h-16 py-2": isCompact && !isExpanded,
      "py-4": isHeaderFullyExpanded,
    }
  );

  return (
    <header className={headerClasses}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Row: Logo - Center - Icons */}
        <div className="grid grid-cols-[auto,1fr,auto] items-center transition-all">
          {/* Logo */}
          <div className="flex flex-col">
            <Link href="/" className="text-xl font-bold text-brand-dark">
              Booka.co.za
            </Link>
          </div>

          {/* Center: Compact search trigger */}
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <SearchBarCompact
                category={category?.label}
                location={location}
                when={when}
                onOpen={() => {
                  setIsExpanded(true);
                  if (isCompact && onForceHeaderExpand) {
                    onForceHeaderExpand();
                  }
                }}
              />
            </div>
          </div>

          {/* Icons */}
          <div className="hidden sm:flex items-center gap-4">
            {user ? (
              <>
                {user.user_type === 'artist' && (
                  <button onClick={toggleArtistView} className="text-sm text-gray-700">
                    {artistViewActive ? 'Switch to Booking' : 'Switch to Artist View'}
                  </button>
                )}
                <BookingRequestIcon />
                <NotificationBell />
                <Menu as="div" className="relative">
                  <Menu.Button className="flex rounded-full bg-gray-100 text-sm focus:outline-none">
                    <Avatar
                      src={user.profile_picture_url || null}
                      initials={user.first_name?.[0] || user.email[0]}
                      size={32}
                    />
                  </Menu.Button>
                  <Transition as={Fragment} enter="transition ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
                      <Menu.Item>
                        {({ active }) => (
                          <Link href="/dashboard" className={clsx('block px-4 py-2 text-sm text-gray-700', { 'bg-gray-100': active })}>
                            Dashboard
                          </Link>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button onClick={logout} className={clsx('block w-full text-left px-4 py-2 text-sm text-gray-700', { 'bg-gray-100': active })}>
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
                <Link href="/login" className="text-sm text-gray-600">Sign in</Link>
                <Link href="/register" className="text-sm text-white bg-brand-dark px-3 py-1 rounded">Sign up</Link>
              </div>
            )}
          </div>
        </div>

        {/* Extra content bar */}
        {isHeaderFullyExpanded && !isExpanded && extraBar && (
          <div className="mt-3">{extraBar}</div>
        )}
      </div>

      <SearchBarExpanded
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        initialLocation={location}
        initialWhen={when}
        onSearch={({ location: loc, when: w }) => {
          setLocation(loc || '');
          setWhen(w || null);
          handleSearch({ category: category?.value, location: loc, when: w });
        }}
      />

      <MobileMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={clientNav}
        drawerNavigation={clientNav}
        user={user}
        logout={logout}
        pathname={pathname}
      />
    </header>
  );
}
