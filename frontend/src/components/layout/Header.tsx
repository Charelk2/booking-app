'use client';

import { useState, useCallback, Fragment, ReactNode } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import NavLink from './NavLink';
import NotificationBell from './NotificationBell';
import BookingRequestIcon from './BookingRequestIcon';
import MobileMenuDrawer from './MobileMenuDrawer';
import SearchBar from '../search/SearchBar';
import SearchBarInline from '../search/SearchBarInline';
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

function ClientNav({ pathname }: { pathname: string }) {
  return (
    <>
      {clientNav.map((item) => (
        <NavLink key={item.name} href={item.href} isActive={pathname === item.href}>
          {item.name}
        </NavLink>
      ))}
    </>
  );
}

function ArtistNav({ user, pathname }: { user: { id: number }; pathname: string }) {
  const items = [
    { name: 'Today', href: '/dashboard/today' },
    { name: 'View Profile', href: `/artists/${user.id}` },
    { name: 'Services', href: '/dashboard?tab=services' },
    { name: 'Messages', href: '/inbox' },
  ];
  return (
    <>
      {items.map((item) => (
        <NavLink key={item.name} href={item.href} isActive={pathname === item.href}>
          {item.name}
        </NavLink>
      ))}
    </>
  );
}

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

  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState<string>('');
  const [when, setWhen] = useState<Date | null>(null);
  const [inlineSearchBarOpen, setInlineSearchBarOpen] = useState<boolean>(false);

  const handleInlineSearch = useCallback(
    ({ category, location, when }: SearchParams) => {
      const params = new URLSearchParams();
      if (category) params.set('category', UI_CATEGORY_TO_SERVICE[category] || category);
      if (location) params.set('location', location);
      if (when) params.set('when', when.toISOString());
      router.push(`/artists?${params.toString()}`);
      setInlineSearchBarOpen(false);
    },
    [router]
  );

  const handleInlineSearchBarOpenChange = useCallback(
    (open: boolean) => {
      setInlineSearchBarOpen(open);
      if (open && isCompact && onForceHeaderExpand) {
        onForceHeaderExpand();
      }
    },
    [isCompact, onForceHeaderExpand]
  );

  const isHeaderFullyExpanded = !isCompact || inlineSearchBarOpen;

  const headerClasses = clsx(
    "sticky top-0 z-40 bg-white transition-all duration-300 ease-in-out",
    {
      "shadow-md h-16 py-2": isCompact && !inlineSearchBarOpen,
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

          {/* Center: Nav or Compact Search */}
          <div className="hidden md:flex justify-center">
            {isHeaderFullyExpanded && !inlineSearchBarOpen ? (
              <div
                className={clsx(
                  "overflow-hidden transition-all duration-300 ease-in-out",
                  {
                    "max-h-0 opacity-0 pointer-events-none": isCompact,
                    "max-h-20 opacity-100 pointer-events-auto": !isCompact,
                  }
                )}
              >
                <nav className="flex gap-6">
                  {user?.user_type === 'artist' && artistViewActive ? (
                    <ArtistNav user={user} pathname={pathname} />
                  ) : (
                    <ClientNav pathname={pathname} />
                  )}
                </nav>
              </div>
            ) : (
              <div className="w-full max-w-2xl">
                <SearchBarInline
                  onSearch={handleInlineSearch}
                  onExpandedChange={handleInlineSearchBarOpenChange}
                  isOpen={inlineSearchBarOpen}
                />
              </div>
            )}
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

        {/* Expanded Search (Home only) */}
        {isHeaderFullyExpanded && !inlineSearchBarOpen && pathname === '/' && (
          <div className="mt-3 max-w-4xl mx-auto">
            <SearchBar
              compact
              category={category}
              setCategory={setCategory}
              location={location}
              setLocation={setLocation}
              when={when}
              setWhen={setWhen}
              onSearch={handleInlineSearch}
            />
          </div>
        )}

        {/* Extra content bar */}
        {isHeaderFullyExpanded && !inlineSearchBarOpen && extraBar && (
          <div className="mt-3">{extraBar}</div>
        )}
      </div>

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
