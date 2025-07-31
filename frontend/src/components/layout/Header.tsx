'use client';

import { Fragment, useState, ReactNode } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Bars3Icon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import NavLink from './NavLink';
import NotificationBell from './NotificationBell';
import BookingRequestIcon from './BookingRequestIcon';
import MobileMenuDrawer from './MobileMenuDrawer';
import SearchBar from '../search/SearchBar';
import { UI_CATEGORIES, UI_CATEGORY_TO_SERVICE } from '@/lib/categoryMap';
import { type Category } from '../search/SearchFields';
import { useRouter } from 'next/navigation';
import { Avatar } from '../ui';

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

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function Header({ extraBar }: { extraBar?: ReactNode }) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === '/';

  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);

  const handleSearch = ({ category: cat, location: loc, when: date }: { category?: string; location?: string; when?: Date | null }) => {
    const params = new URLSearchParams();
    if (cat) {
      const mapped = UI_CATEGORY_TO_SERVICE[cat] || cat;
      params.set('category', mapped);
    }
    if (loc) params.set('location', loc);
    if (date) params.set('when', date.toISOString());
    const qs = params.toString();
    router.push(qs ? `/artists?${qs}` : '/artists');
  };

  const artistNav = user?.user_type === 'artist'
    ? [
        { name: 'Today', href: '/dashboard/today' },
        { name: 'View Profile', href: `/artists/${user.id}` },
        { name: 'Services', href: '/dashboard?tab=services' },
        { name: 'Messages', href: '/inbox' },
      ]
    : [];

  const navigation =
    user?.user_type === 'artist' && artistViewActive ? artistNav : clientNav;

  const drawerNavigation = (
    user?.user_type === 'artist' && !artistViewActive ? artistNav : clientNav
  ).slice();

  if (user?.user_type === 'artist') {
    drawerNavigation.push(
      { name: 'Sound Providers', href: '/sound-providers' },
      { name: 'Quote Calculator', href: '/quote-calculator' },
      { name: 'Quote Templates', href: '/dashboard/profile/quote-templates' },
    );
  }

  return (
    <header className="sticky top-0 z-40 bg-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Row A */}
        <div className="h-16 grid grid-cols-[auto,1fr,auto] items-center">
          {/* Left: logo + tagline */}
          <div className="flex flex-col">
            <Link href="/" className="flex shrink-0 items-center text-xl font-bold text-brand-dark no-underline hover:no-underline">
              Booka.co.za
            </Link>
            {isHome && (
              <span className="hidden sm:block -mt-0.5 text-[11px] leading-4 text-gray-600">
                Book legendary artists
              </span>
            )}
          </div>

          {/* Center: nav */}
          <nav className="hidden md:flex justify-center gap-6">
            {user?.user_type === 'artist' && artistViewActive ? (
              <ArtistNav user={user} pathname={pathname} />
            ) : (
              <ClientNav pathname={pathname} />
            )}
          </nav>

          {/* Right: auth / icons */}
          <div className="hidden sm:flex items-center justify-end space-x-4">
            {user ? (
              <>
                {user.user_type === 'artist' && (
                  <button
                    type="button"
                    onClick={toggleArtistView}
                    className="text-sm text-gray-700 hover:text-brand-dark"
                  >
                    {artistViewActive ? 'Switch to Booking' : 'Switch to Artist View'}
                  </button>
                )}
                <BookingRequestIcon />
                <NotificationBell />
                <Menu as="div" className="relative ml-3">
                  <div>
                    <Menu.Button className="flex rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2">
                      <span className="sr-only">Open user menu</span>
                      <Avatar src={user.profile_picture_url || null} initials={user.first_name?.[0] || user.email[0]} size={32} />
                    </Menu.Button>
                  </div>
                  <Transition as={Fragment} enter="transition ease-out duration-200" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-background py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <Menu.Item>
                        {({ active }) => (
                          <Link href="/dashboard" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                            Dashboard
                          </Link>
                        )}
                      </Menu.Item>
                      {user.user_type === 'artist' && (
                        <>
                          <Menu.Item>
                            {({ active }) => (
                              <Link href="/dashboard/profile/edit" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                                Edit Profile
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link href="/dashboard/quotes" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                                Quotes
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link href="/dashboard/profile/quote-templates" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
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
                              <Link href="/dashboard/client/bookings" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                                My Bookings
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link href="/dashboard/client/quotes" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                                My Quotes
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link href="/account" className={classNames(active ? 'bg-gray-100' : '', 'block px-4 py-2 text-sm text-gray-700 no-underline hover:no-underline')}>
                                Account
                              </Link>
                            )}
                          </Menu.Item>
                        </>
                      )}
                      <Menu.Item>
                        {({ active }) => (
                          <button onClick={logout} className={classNames(active ? 'bg-gray-100' : '', 'block w-full text-left px-4 py-2 text-sm text-gray-700')}>
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
                <Link href="/login" className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium no-underline hover:no-underline">
                  Sign in
                </Link>
                <Link href="/register" className="bg-brand-dark text-white hover:bg-brand-dark px-3 py-2 rounded-md text-sm font-medium no-underline hover:no-underline">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center sm:hidden">
          {user?.user_type === 'artist' && (
            <button
              type="button"
              onClick={toggleArtistView}
              className="mr-2 text-sm text-gray-700 hover:text-brand-dark"
            >
              {artistViewActive ? 'Switch to Booking' : 'Switch to Artist View'}
            </button>
          )}
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

        {/* Row B */}
        {isHome && (
          <div className="w-full max-w-4xl mx-auto px-4 pb-5 pt-2">
            <SearchBar
              compact
              category={category}
              setCategory={setCategory}
              location={location}
              setLocation={setLocation}
              when={when}
              setWhen={setWhen}
              onSearch={handleSearch}
            />
          </div>
        )}
        {extraBar && (
          <div className="pb-3 pt-2">{extraBar}</div>
        )}
      </div>
      {(isHome || extraBar) && <div className="border-t border-gray-200" />}
      <MobileMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
        drawerNavigation={drawerNavigation}
        user={user}
        logout={logout}
        pathname={pathname}
      />
    </header>
  );
}
