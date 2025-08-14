
// ──────────────────────────────────────────────────────────────────────────────
// FILE: src/components/layout/Header.tsx
// Purpose: Visual header; on mobile show small Search button when COMPACTED.
//          Tapping opens MobileSearch and forces 'expanded-from-compact'.
// ──────────────────────────────────────────────────────────────────────────────
'use client';

import {
  Fragment,
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  MagnifyingGlassIcon,
  Bars3Icon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  CalendarDaysIcon,
  ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';

import { useAuth } from '@/contexts/AuthContext';
import NavLink from './NavLink';
import NotificationBell from './NotificationBell';
import MobileMenuDrawer from './MobileMenuDrawer';
import SearchBar from '../search/SearchBar';
import MobileSearch, { type MobileSearchHandle } from '../search/MobileSearch';
import useServiceCategories, { type Category as CategoryType } from '@/hooks/useServiceCategories';
import { Avatar } from '../ui';
import { parseISO, isValid } from 'date-fns';
import { getStreetFromAddress } from '@/lib/utils';

/** Header state must match MainLayout expectations */
export type HeaderState = 'initial' | 'compacted' | 'expanded-from-compact';

type SearchParamsShape = {
  category?: string;
  location?: string;
  when?: Date | null;
};

const clientNav = [
  { name: 'Services', href: '/services' },
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
    { name: 'View Profile', href: `/service-providers/${user.id}` },
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
  headerState: HeaderState;
  onForceHeaderState: (state: HeaderState, scrollTarget?: number) => void;
  showSearchBar?: boolean;
  filterControl?: ReactNode;
}

const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  { extraBar, headerState, onForceHeaderState, showSearchBar = true, filterControl }: HeaderProps,
  ref,
) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isArtistsPage = pathname.startsWith('/service-providers') || pathname.startsWith('/category');
  const [menuOpen, setMenuOpen] = useState(false);
  const isArtistView = user?.user_type === 'service_provider' && artistViewActive;

  // Search params state (shared Mobile + Desktop)
  const categories = useServiceCategories();
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [location, setLocation] = useState<string>('');
  const [when, setWhen] = useState<Date | null>(null);

  // MobileSearch control
  const mobileSearchRef = useRef<MobileSearchHandle>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Hydrate from URL
  useEffect(() => {
    if (!categories.length) return;
    const serviceCat = searchParams.get('category');
    const uiCategory = serviceCat ? categories.find((c) => c.value === serviceCat) || null : null;
    setCategory(uiCategory);
    setLocation(searchParams.get('location') || '');

    const w = searchParams.get('when');
    if (w) {
      try {
        const parsed = parseISO(w);
        setWhen(isValid(parsed) ? parsed : null);
      } catch { setWhen(null); }
    } else {
      setWhen(null);
    }
  }, [searchParams, categories]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    [],
  );

  // Submit unified search
  const handleSearch = useCallback(({ category, location, when }: SearchParamsShape) => {
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (when) params.set('when', when.toISOString());
    const path = category ? `/category/${category}` : '/service-providers';
    const qs = params.toString();
    router.push(qs ? `${path}?${qs}` : path);

    if (isArtistsPage) {
      onForceHeaderState('compacted');
    } else {
      onForceHeaderState(window.scrollY > 0 ? 'compacted' : 'initial', window.scrollY > 0 ? undefined : 0);
    }
  }, [router, onForceHeaderState, isArtistsPage]);

  // Desktop cancel → snap header appropriately
  const handleSearchBarCancel = useCallback(() => {
    if (isArtistsPage) {
      onForceHeaderState('compacted');
    } else {
      onForceHeaderState(window.scrollY > 0 ? 'compacted' : 'initial', window.scrollY > 0 ? undefined : 0);
    }
  }, [onForceHeaderState, isArtistsPage]);

  // While MOBILE search open: keep header expanded and at top; when close → compact
  useEffect(() => {
    if (mobileSearchOpen) {
      onForceHeaderState('expanded-from-compact', 0);
    } else if (headerState === 'expanded-from-compact') {
      onForceHeaderState(isArtistsPage || window.scrollY > 0 ? 'compacted' : 'initial');
    }
  }, [mobileSearchOpen, headerState, onForceHeaderState, isArtistsPage]);

  // If header compacts while mobile search is open, close it
  useEffect(() => {
    if (headerState === 'compacted') mobileSearchRef.current?.close?.();
  }, [headerState]);

  // Lock home content taps/focus while mobile search is open (MainLayout sets #app-content)
  useEffect(() => {
    const content = document.getElementById('app-content');
    if (!content) return;
    if (mobileSearchOpen) {
      content.setAttribute('inert', '');
      content.setAttribute('aria-hidden', 'true');
      content.classList.add('pointer-events-none');
    } else {
      content.removeAttribute('inert');
      content.removeAttribute('aria-hidden');
      content.classList.remove('pointer-events-none');
    }
  }, [mobileSearchOpen]);

  const headerClasses = clsx(
    'relative sticky top-0 z-50',
    'transition-all duration-200 ease-out',
    'bg-gradient-to-br from-[#F6F3EF]/100 via-[#F7FAFF]/100 to-[#EEF3FA]/100',
    'supports-[backdrop-filter]:backdrop-blur-[1px]',
  );

  return (
    <header
      ref={ref}
      id="app-header"
      className={headerClasses}
      data-header-state={headerState}
      data-lock-compact={mobileSearchOpen ? 'true' : 'false'}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Row */}
        <div className="grid grid-cols-[auto,1fr,auto] items-center py-2">
          {/* Left: Menu + Logo + (mobile compact search button) */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className={clsx('md:hidden p-2 rounded-lg hover:bg-white/60')}>
              <Bars3Icon className="h-6 w-6" />
            </button>

            <Link href="/" className="text-2xl font-bold text-brand-dark no-underline">Booka</Link>

            {/* Mobile compact search button appears NEXT to Booka when compacted */}
            {!isArtistView && showSearchBar && headerState === 'compacted' && (
              <button
                type="button"
                onClick={() => { onForceHeaderState('expanded-from-compact', 0); mobileSearchRef.current?.open?.(); }}
                className="ml-2 md:hidden inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-full border border-black/10 bg-white/90 shadow-sm"
                aria-label="Open search"
              >
                <MagnifyingGlassIcon className="h-3.5 w-3.5 text-slate-700" />
                <span className="font-medium text-slate-800">Search</span>
              </button>
            )}
          </div>

          {/* Center: Nav (md+), compact summary (md+) */}
          <div className="hidden md:flex justify-center flex-grow relative">
            {/* Nav links */}
            <div className={clsx('content-area-wrapper header-nav-links', {
              'opacity-0 pointer-events-none': headerState === 'compacted' && !isArtistView,
              'opacity-100 pointer-events-auto transition-opacity duration-100 delay-100': headerState !== 'compacted' || isArtistView,
            })}>
              <nav className="flex gap-6">
                {user?.user_type === 'service_provider' && artistViewActive ? (
                  <ArtistNav user={user} pathname={pathname} />
                ) : (
                  <ClientNav pathname={pathname} />
                )}
              </nav>
            </div>

            {/* Desktop compact pill summary */}
            {!isArtistView && showSearchBar && (
              <div className={clsx(
                'compact-pill-wrapper absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full flex items-center justify-center gap-2',
                { 'opacity-0 pointer-events-none': headerState !== 'compacted', 'opacity-100 pointer-events-auto transition-opacity duration-100 delay-100': headerState === 'compacted' },
              )}>
                <button
                  id="compact-search-trigger"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onForceHeaderState('expanded-from-compact'); }}
                  className="flex-1 w-full max-w-xl flex items-center bg-white justify-between px-4 py-2 border border-gray-300 rounded-full shadow-sm hover:shadow-md text-sm"
                >
                  <div className="flex flex-1 divide-x divide-gray-300">
                    <div className="flex-1 px-2 truncate">{category ? category.label : 'Add service'}</div>
                    <div className="flex-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis">{location ? getStreetFromAddress(location) : 'Add location'}</div>
                    <div className="flex-1 px-2 truncate">{when ? dateFormatter.format(when) : 'Add dates'}</div>
                  </div>
                  <MagnifyingGlassIcon className="ml-2 h-5 w-5 text-gray-500 flex-shrink-0" />
                </button>
                {filterControl && <div className="shrink-0">{filterControl}</div>}
              </div>
            )}
          </div>

          {/* Right: Auth / Actions (sm+) */}
          <div className="hidden sm:flex items-center gap-2">
            {user ? (
              <>
                {user.user_type === 'service_provider' && (
                  <button onClick={toggleArtistView} className="px-3 py-2 rounded-lg hover:bg-white/60 text-gray-800">
                    {artistViewActive ? 'Switch to Booking' : 'Switch to Service Provider View'}
                  </button>
                )}
                <div className="p-1 rounded-lg hover:bg-white/60"><NotificationBell /></div>
                <Menu as="div" className="relative">
                  <Menu.Button aria-label="Account menu" className="rounded-full bg-gray-100 text-sm focus:outline-none p-1">
                    <Avatar src={user.profile_picture_url || null} initials={user.first_name?.[0] || user.email[0]} size={40} />
                  </Menu.Button>
                  <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                    <Menu.Items className="absolute right-0 mt-2 w-64 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none divide-y divide-gray-100">
                      <div className="py-1">
                        {user.user_type === 'service_provider' ? (
                          <>
                            <Menu.Item>{({ active }) => (
                              <Link href="/dashboard/artist" className={clsx('group flex items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                                <CalendarDaysIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Dashboard
                              </Link>
                            )}</Menu.Item>
                            <Menu.Item>{({ active }) => (
                              <Link href="/dashboard/profile/edit" className={clsx('group flex items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                                <UserCircleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Edit Profile
                              </Link>
                            )}</Menu.Item>
                          </>
                        ) : (
                          <>
                            <Menu.Item>{({ active }) => (
                              <Link href="/dashboard/client" className={clsx('group flex items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                                <CalendarDaysIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Events
                              </Link>
                            )}</Menu.Item>
                            <Menu.Item>{({ active }) => (
                              <Link href="/inbox" className={clsx('group flex items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                                <ChatBubbleLeftEllipsisIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Messages
                              </Link>
                            )}</Menu.Item>
                            <Menu.Item>{({ active }) => (
                              <Link href="/account" className={clsx('group flex items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                                <UserCircleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Edit Profile
                              </Link>
                            )}</Menu.Item>
                          </>
                        )}
                        <div className="border-t border-gray-200 my-1" />
                        <Menu.Item>{({ active }) => (
                          <button onClick={logout} className={clsx('group flex w-full items-center px-4 py-2 text-sm text-gray-700', { 'bg-gray-100 text-gray-900': active })}>
                            <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" /> Sign out
                          </button>
                        )}</Menu.Item>
                      </div>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </>
            ) : (
              <div className="flex gap-2">
                <Link href="/login" className="px-3 py-2 text-sm rounded-lg hover:bg-white/60 text-gray-600">Sign in</Link>
                <Link href="/register" className="px-3 py-2 text-sm rounded-lg bg-brand-dark text-white">Sign up</Link>
              </div>
            )}
          </div>
        </div>

        {/* Search area */}
        {!isArtistView && showSearchBar && (
          <div className={clsx('max-w-2xl mx-auto relative', headerState === 'compacted' ? 'mt-0 mb-0 md:mt-3 md:mb-4' : 'mt-3 mb-4')}>
            {/* Mobile overlay search */}
            <div className="md:hidden">
              <MobileSearch
                ref={mobileSearchRef}
                category={category}
                setCategory={setCategory}
                location={location}
                setLocation={setLocation}
                when={when}
                setWhen={setWhen}
                onSearch={handleSearch}
                onCancel={handleSearchBarCancel}
                onOpenChange={setMobileSearchOpen}
                // Hide internal pill when header is COMPACT (we use the tiny header button)
                showPill={headerState !== 'compacted'}
              />
            </div>

            {/* Desktop full SearchBar */}
            <div className={clsx('hidden md:block', headerState === 'compacted' ? 'opacity-0 scale-y-0 h-0 pointer-events-none' : 'opacity-100 scale-y-100 pointer-events-auto')}>
              <SearchBar
                category={category}
                setCategory={setCategory}
                location={location}
                setLocation={setLocation}
                when={when}
                setWhen={setWhen}
                onSearch={handleSearch}
                onCancel={handleSearchBarCancel}
                compact={false}
              />
            </div>
          </div>
        )}

        {/* Optional extra content bar */}
        {extraBar && (headerState === 'initial' || headerState === 'expanded-from-compact') && (
          <div className="mt-3">{extraBar}</div>
        )}
      </div>

      <MobileMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} navigation={clientNav} user={user} logout={logout} pathname={pathname} />
    </header>
  );
});

Header.displayName = 'Header';
export default Header;
