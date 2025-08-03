// src/components/layout/Header.tsx
'use client';

import { Fragment, ReactNode, forwardRef, useCallback, useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Bars3Icon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext'; // Assuming AuthContext is set up
import NavLink from './NavLink'; // Assuming NavLink is set up
import NotificationBell from './NotificationBell'; // Assuming NotificationBell is set up
import BookingRequestIcon from './BookingRequestIcon'; // Assuming BookingRequestIcon is set up
import MobileMenuDrawer from './MobileMenuDrawer'; // Assuming MobileMenuDrawer is set up
import SearchBar from '../search/SearchBar'; // The full search bar component
import { UI_CATEGORY_TO_SERVICE } from '@/lib/categoryMap';
import { Avatar } from '../ui'; // Assuming Avatar is set up
import clsx from 'clsx';
import { type Category } from '../search/SearchFields'; // Import Category type from SearchFields


// Define header states (must match MainLayout)
export type HeaderState = 'initial' | 'compacted' | 'expanded-from-compact'; // Exported for MainLayout

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
  headerState: HeaderState; // New prop for header state
  onForceHeaderState: (state: HeaderState, scrollTarget?: number) => void; // MODIFIED: Added scrollTarget
  showSearchBar?: boolean; // Controls visibility of built-in search bar
  alwaysCompact?: boolean; // Keeps pill visible regardless of scroll
}

// Forward the ref so MainLayout can access the header DOM element
const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    extraBar,
    headerState,
    onForceHeaderState,
    showSearchBar = true,
    alwaysCompact = false,
  }: HeaderProps,
  ref,
) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false); // Mobile menu drawer state

  // Search parameters for the search bars (managed locally by Header and passed to SearchBar)
  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState<string>('');
  const [when, setWhen] = useState<Date | null>(null);

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Common search handler for when the user clicks the final "Search" button on the full SearchBar
  const handleSearch = useCallback(
    ({ category, location, when }: SearchParams) => {
      const params = new URLSearchParams();
      if (category) params.set('category', UI_CATEGORY_TO_SERVICE[category] || category);
      if (location) params.set('location', location);
      if (when) params.set('when', when.toISOString());
      router.push(`/artists?${params.toString()}`);
      
      // After search submission, revert header.
      // Let MainLayout's scroll logic handle the final state based on current scroll.
      // We explicitly close the expanded state here.
      onForceHeaderState(window.scrollY > 0 ? 'compacted' : 'initial', window.scrollY > 0 ? undefined : 0);
    },
    [router, onForceHeaderState] // Removed alwaysCompact as it's handled by MainLayout
  );

  // This is crucial: Called by SearchBar when its *internal popups* are closed (e.g., clicking outside calendar)
  const handleSearchBarCancel = useCallback(() => {
    // Let MainLayout's scroll logic determine the final state based on current scroll.
    onForceHeaderState(window.scrollY > 0 ? 'compacted' : 'initial', window.scrollY > 0 ? undefined : 0);
  }, [onForceHeaderState]);

  // Main header classes reacting to headerState
  const headerClasses = clsx(
    "app-header sticky top-0 z-40 bg-white transition-all duration-300 ease-in-out",
    {
      "compacted": headerState === 'compacted',
      "expanded-from-compact": headerState === 'expanded-from-compact',
      // 'initial' state has no additional class, relies on default styling
    }
  );

  return (
    <header ref={ref} id="app-header" className={headerClasses} data-header-state={headerState}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Row: Logo - Center - Icons */}
        <div className="grid grid-cols-[auto,1fr,auto] items-center py-2"> {/* Added py-2 back for consistency */}
          {/* Logo */}
          <div className="flex flex-col">
            <Link href="/" className="text-xl font-bold text-brand-dark no-underline">
              Booka.co.za
            </Link>
          </div>

          {/* Center Section: Dynamically switches between Nav Links and Compact Pill */}
          <div className="hidden md:flex justify-center flex-grow relative">
            {/* Nav Links (Visible initially, and when compact search expands) */}
            <div className={clsx("content-area-wrapper header-nav-links", {
              "opacity-0 pointer-events-none": headerState === 'compacted',
              "opacity-100 pointer-events-auto transition-opacity duration-300 delay-100": headerState !== 'compacted'
            })}>
              <nav className="flex gap-6">
                {user?.user_type === 'artist' && artistViewActive ? (
                  <ArtistNav user={user} pathname={pathname} />
                ) : (
                  <ClientNav pathname={pathname} />
                )}
              </nav>
            </div>

            {/* Compact Search Pill (Visible when scrolled/compacted) */}
            {showSearchBar && (
              <div className={clsx("compact-pill-wrapper absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full flex justify-center", {
                "opacity-0 pointer-events-none": headerState !== 'compacted',
                "opacity-100 pointer-events-auto transition-opacity duration-300 delay-100": headerState === 'compacted'
              })}>
                <button
                  id="compact-search-trigger"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onForceHeaderState('expanded-from-compact');
                  }}
                  className="flex-1 w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-full shadow-sm hover:shadow-md text-sm"
                >
                  <div className="flex flex-1 divide-x divide-gray-300">
                    <div className="flex-1 px-2 truncate">
                      {category ? category.label : 'Add artist'}
                    </div>
                    <div className="flex-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                      {location || 'Add location'}
                    </div>
                    <div className="flex-1 px-2 truncate">
                      {when ? dateFormatter.format(when) : 'Add dates'}
                    </div>
                  </div>
                  <MagnifyingGlassIcon className="ml-2 h-5 w-5 text-gray-500 flex-shrink-0" />
                </button>
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

        {/* Full Search Bar (Visible initially, and when expanded from compact) */}
        {showSearchBar && !extraBar && (
          <div className={clsx("content-area-wrapper header-full-search-bar mt-3 max-w-4xl mx-auto", {
            "opacity-0 scale-y-0 h-0 pointer-events-none": headerState === 'compacted',
            "opacity-100 scale-y-100 pointer-events-auto": headerState !== 'compacted'
          })}>
            <SearchBar
              category={category}
              setCategory={setCategory}
              location={location}
              setLocation={setLocation}
              when={when}
              setWhen={setWhen}
              onSearch={handleSearch}
              onCancel={handleSearchBarCancel} // Pass handler for closing from SearchBar's internal popups
              compact={false} // This SearchBar is always the "full" one for visuals
            />
          </div>
        )}

        {/* Extra content bar (if needed, its visibility logic might need to align with headerState) */}
        {extraBar && (headerState === 'initial' || headerState === 'expanded-from-compact') && (
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
});

export default Header;
