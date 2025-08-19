// src/components/layout/Header.tsx
// ──────────────────────────────────────────────────────────────────────────────
// MOBILE: static pill next to "Booka". Hamburger is WHITE.
// DESKTOP: compact -> full expands on interaction; overlay arming handled
//          in MainLayout; auto-focus SearchBar after expand.
// Styling goals:
//  - No red hover anywhere (nav, menu, drawer trigger, links)
//  - No underline on hover
//  - Mobile hamburger icon visible (white) on dark header
//  - Text: light surfaces = black, dark surfaces = white
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
  // kept for parity (unused here)
  FilmIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  MicrophoneIcon,
  TicketIcon,
  FaceSmileIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';

import { useAuth } from '@/contexts/AuthContext';
// import NotificationBell from './NotificationBell';
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import MobileMenuDrawer from './MobileMenuDrawer';
import SearchBar from '../search/SearchBar';
import MobileSearch, { type MobileSearchHandle } from '../search/MobileSearch';
import useServiceCategories, { type Category as CategoryType } from '@/hooks/useServiceCategories';
import { Avatar } from '../ui';
import { parseISO, isValid } from 'date-fns';
import { getStreetFromAddress } from '@/lib/utils';
// Link already imported above
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import { ChatBubbleLeftRightIcon as ChatOutline } from '@heroicons/react/24/outline';
import React from 'react';

export type HeaderState = 'initial' | 'compacted' | 'expanded-from-compact';

type SearchParamsShape = {
  category?: string;
  location?: string;
  when?: Date | null;
};

const SHOW_CLIENT_TOP_NAV = true;

const clientNav = [
  { name: 'Services', href: '/services' },
  { name: 'Contact', href: '/contact' },
];

// Shared classes to *ensure* no red/underline on hover
const hoverNeutralLink =
  'no-underline hover:no-underline hover:text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';
const hoverNeutralLink2 =
  'no-underline hover:no-underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

// Filter icon overlay: forces white icon/text and supports placing it *outside* on the right
function FilterSlot({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'pointer-events-none absolute top-1/2 -translate-y-1/2 z-20',
        // force white for icon/text regardless of nested component defaults
        'text-white [&_svg]:!text-white [&_svg]:!stroke-white [&_*]:!text-white',
        className
      )}
      aria-hidden="false"
    >
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

function ClientNav({ pathname }: { pathname: string }) {
  return (
    <>
      {clientNav.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={clsx(
              'px-2 py-1 text-sm transition',
              'text-white/90 hover:text-white',
              hoverNeutralLink,
              isActive && 'font-semibold text-white'
            )}
          >
            {item.name}
          </Link>
        );
      })}
    </>
  );
}

function ArtistNav({ user, pathname }: { user: { id: number }; pathname: string }) {
  const items = [
    { name: 'Today', href: '/dashboard/today' },
    { name: 'View Profile', href: `/service-providers/${user.id}` },
    { name: 'Services', href: '/dashboard?tab=services' },
  ];
  return (
    <>
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={clsx(
              'px-2 py-1 text-sm transition',
              'text-white/90 hover:text-white',
              hoverNeutralLink,
              isActive && 'font-semibold text-white'
            )}
          >
            {item.name}
          </Link>
        );
      })}
    </>
  );
}

// Lightweight messages link with unread badge, defined once, used in header.
function HeaderMessagesLink() {
  const { count } = useUnreadThreadsCount(30000);
  const router = useRouter();
  return (
    <Link
      href="/inbox"
      className="relative inline-flex items-center gap-2 px-3 py-2 rounded-lg text-white hover:bg-gray-900 hover:text-white hover:no-underline"
      aria-label={count > 0 ? `Messages (${count} unread)` : 'Messages'}
      onMouseEnter={() => router.prefetch?.('/inbox')}
      onFocus={() => router.prefetch?.('/inbox')}
    >
      {count > 0 ? (
        <ChatBubbleLeftRightIcon className="h-5 w-5" />
      ) : (
        <ChatOutline className="h-5 w-5" />
      )}
      <span className="text-sm">Messages</span>
      {count > 0 && (
        <span
          className="ml-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold leading-none px-1"
          aria-label={`${count} unread messages`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

// Placeholder to attach any global styles or preloading if needed later
HeaderMessagesLink.Definition = function Definition() {
  const router = useRouter();
  useEffect(() => {
    const idle = (cb: () => void) => (
      'requestIdleCallback' in window
        ? (window as any).requestIdleCallback(cb)
        : setTimeout(cb, 300)
    );
    idle(() => router.prefetch?.('/inbox'));
  }, [router]);
  return null;
};

function HeaderMessagesLinkMobile() {
  const { count } = useUnreadThreadsCount(30000);
  const router = useRouter();
  return (
    <Link
      href="/inbox"
      className="md:hidden p-2 rounded-xl transition text-white relative hover:bg-gray-900 hover:text-white hover:no-underline"
      aria-label={count > 0 ? `Messages (${count} unread)` : 'Messages'}
      onMouseEnter={() => router.prefetch?.('/inbox')}
      onFocus={() => router.prefetch?.('/inbox')}
    >
      {count > 0 ? (
        <ChatBubbleLeftRightIcon className="h-6 w-6" />
      ) : (
        <ChatOutline className="h-6 w-6" />
      )}
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold leading-none px-1"
          aria-label={`${count} unread messages`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
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
  { extraBar, headerState, onForceHeaderState, showSearchBar = true, filterControl },
  ref,
) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isArtistView = user?.user_type === 'service_provider' && artistViewActive;

  const [menuOpen, setMenuOpen] = useState(false);

  // Search state
  const categories = useServiceCategories();
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [location, setLocation] = useState<string>('');
  const [when, setWhen] = useState<Date | null>(null);

  // Mobile search overlay
  const mobileSearchRef = useRef<MobileSearchHandle>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Desktop SearchBar mount (for focus)
  const desktopSearchMountRef = useRef<HTMLDivElement>(null);

  // Hydrate from URL
  useEffect(() => {
    if (!categories.length) return;

    const serviceCat = searchParams.get('category');
    let nextCategory: CategoryType | null = null;

    if (serviceCat) {
      nextCategory = categories.find((c) => c.value === serviceCat) || null;
    } else {
      const match = pathname.match(/^\/category\/([^/?]+)/);
      if (match) nextCategory = categories.find((c) => c.value === match[1]) || null;
    }

    setCategory(nextCategory);
    setLocation(searchParams.get('location') || '');

    const w = searchParams.get('when');
    if (w) {
      const parsed = parseISO(w);
      setWhen(isValid(parsed) ? parsed : null);
    } else {
      setWhen(null);
    }
  }, [searchParams, categories, pathname]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [],
  );

  // Submit unified search
  const handleSearch = useCallback(
    ({ category, location, when }: SearchParamsShape) => {
      const params = new URLSearchParams();
      if (location) params.set('location', location);
      if (when) params.set('when', when.toISOString());

      const path = category ? `/category/${category}` : '/service-providers';
      const qs = params.toString();
      router.push(qs ? `${path}?${qs}` : path);
      onForceHeaderState('initial');
    },
    [router, onForceHeaderState],
  );

  const handleSearchBarCancel = useCallback(() => {
    onForceHeaderState(
      'initial',
      typeof window !== 'undefined' && window.scrollY === 0 ? 0 : undefined,
    );
  }, [onForceHeaderState]);

  // MOBILE: lock header while mobile search open
  useEffect(() => {
    if (mobileSearchOpen) {
      onForceHeaderState('expanded-from-compact', 0);
    } else if (headerState === 'expanded-from-compact') {
      onForceHeaderState('initial');
    }
  }, [mobileSearchOpen, headerState, onForceHeaderState]);

  // If header compacts externally, close mobile overlay
  useEffect(() => {
    if (headerState === 'compacted') mobileSearchRef.current?.close?.();
  }, [headerState]);

  // Disable background when mobile overlay open
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

  // Expand from compact (desktop)
  const openDesktopSearchFromCompact = useCallback(() => {
    if (isArtistView) return;
    if (headerState === 'expanded-from-compact') return;

    onForceHeaderState('expanded-from-compact');

    const focusSoon = () => {
      const root = desktopSearchMountRef.current;
      if (!root) return;
      const el = root.querySelector<HTMLElement>(
        'input,button,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      el?.focus();
    };
    requestAnimationFrame(() => requestAnimationFrame(focusSoon));
  }, [headerState, isArtistView, onForceHeaderState]);

  // Visual style
  const headerClasses = clsx(
    'sticky top-0 z-50',
    'bg-black supports-[backdrop-filter]:backdrop-blur-md',
    'border-b border-black/5'
  );

  return (
    <header
      ref={ref}
      id="app-header"
      className={headerClasses}
      data-header-state={headerState}
      data-lock-compact={mobileSearchOpen ? 'true' : 'false'}
    >
      <HeaderMessagesLink.Definition />
      <div className="mx-auto full-width px-2 sm:px-4 lg:px-6">
        {/* Top Row */}
        <div className="grid px-2 bg-black grid-cols-[auto,1fr,auto] items-center gap-2">
          {/* Left cluster: menu + brand + (mobile pill) */}
          <div className="col-span-3 md:col-span-1 flex items-center gap-2 w-full min-w-0">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className={clsx(
                'md:hidden p-2 rounded-xl transition',
                'hover:bg-white/10 active:bg-white/15',
                hoverNeutralLink
              )}
            >
              <Bars3Icon className="h-6 w-6 text-white" />
            </button>

            {/* MOBILE: messages shortcut with non-flicker unread badge */}
            <HeaderMessagesLinkMobile />

            <Link
              href="/"
              className={clsx(
                'text-4xl font-bold tracking-tight',
                'text-white',
                hoverNeutralLink2
              )}
              aria-label="Booka home"
            >
              Booka
            </Link>

            {/* MOBILE: search pill (light surface → black text) */}
            {!isArtistView && showSearchBar && (
              <button
                type="button"
                onClick={() => mobileSearchRef.current?.open?.()}
                aria-label="Open search"
                className={clsx(
                  'ml-2 md:hidden inline-flex items-center gap-2 px-3 py-2 text-xs rounded-full',
                  'border border-black/10 bg-white shadow-sm',
                  'flex-1 min-w-0 overflow-hidden',
                  hoverNeutralLink,
                  'text-black'
                )}
              >
                <MagnifyingGlassIcon className="h-4 w-4 text-black shrink-0" />
                <span className="font-medium truncate">Start your search</span>
              </button>
            )}

            {/* MOBILE: filter icon (inline, forced white) */}
            {filterControl && (
              <div className="md:hidden ml-2 shrink-0 text-white [&_svg]:!text-white [&_svg]:!stroke-white [&_*]:!text-white">
                {filterControl}
              </div>
            )}
          </div>

          {/* Center: nav + compact pill (desktop) */}
          <div className="hidden md:flex items-center justify-center relative">
            <nav
              className={clsx('flex gap-6 transition-opacity', {
                'opacity-0 pointer-events-none': headerState === 'compacted' && !isArtistView,
                'opacity-100 pointer-events-auto': headerState !== 'compacted' || isArtistView,
              })}
            >
              {user?.user_type === 'service_provider' && artistViewActive ? (
                <ArtistNav user={user} pathname={pathname} />
              ) : SHOW_CLIENT_TOP_NAV ? (
                <ClientNav pathname={pathname} />
              ) : null}
            </nav>

            {/* DESKTOP: compact state pill + filter icon OUTSIDE on the right */}
            {!isArtistView && showSearchBar && (
              <div
                className={clsx(
                  'absolute inset-0 flex items-center justify-center px-4',
                  headerState === 'compacted'
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none',
                  'transition-opacity'
                )}
              >
                <div className="relative w-full max-w-2xl">
                  <button
                    id="compact-search-trigger"
                    type="button"
                    aria-expanded={headerState === 'expanded-from-compact'}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openDesktopSearchFromCompact();
                    }}
                    className={clsx(
                      'w-full flex items-center justify-between rounded-full',
                      'border border-black/10 bg-white/95 shadow-sm hover:shadow-md',
                      // extra right padding is not needed since icon is *outside*
                      'px-4 py-2 text-sm',
                      hoverNeutralLink,
                      'text-black'
                    )}
                  >
                    <div className="flex flex-1 divide-x divide-slate-200">
                      <div className="flex-1 px-2 truncate">
                        {category ? category.label : 'Add service'}
                      </div>
                      <div className="flex-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                        {location ? getStreetFromAddress(location) : 'Add location'}
                      </div>
                      <div className="flex-1 px-2 truncate">
                        {when ? dateFormatter.format(when) : 'Add dates'}
                      </div>
                    </div>
                    <MagnifyingGlassIcon className="ml-3 h-5 w-5 text-slate-600 shrink-0" />
                  </button>

                  {/* Outside-right white filter icon */}
                  {filterControl && (
                    <FilterSlot className="hidden md:block right-[-44px]">
                      {filterControl}
                    </FilterSlot>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="hidden sm:flex items-center justify-end gap-2">
            {user ? (
              <>
                {user.user_type === 'service_provider' && (
                  <button
                    onClick={toggleArtistView}
                    className="px-3 py-2 text-sm rounded-lg font-bold hover:bg-gray-900 text-white"
                  >
                    {artistViewActive ? 'Switch to Booking' : 'Switch to Hosting'}
                  </button>
                )}
                {/* Messages link with unread badge (no flicker) */}
                <HeaderMessagesLink />

                <Menu as="div" className="relative">
                  <Menu.Button
                    aria-label="Account menu"
                    className={clsx(
                      'rounded-full bg-white/90 hover:bg-white p-1 transition',
                      hoverNeutralLink
                    )}
                  >
                    <Avatar
                      src={user.profile_picture_url || null}
                      initials={user.first_name?.[0] || user.email[0]}
                      size={40}
                    />
                  </Menu.Button>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="opacity-100 scale-100"
                    leaveTo="opacity-0 scale-95"
                  >
                    <Menu.Items className="absolute right-0 mt-2 w-64 origin-top-right bg-white rounded-xl shadow-lg ring-1 ring-black/5 focus:outline-none divide-y divide-slate-100">
                      <div className="py-1">
                        {user.user_type === 'service_provider' ? (
                          <>
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/artist"
                                  className={clsx(
                                    'group flex items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink
                                  )}
                                >
                                  <CalendarDaysIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                                  Dashboard
                                </Link>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/profile/edit"
                                  className={clsx(
                                    'group flex items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink
                                  )}
                                >
                                  <UserCircleIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                                  Edit Profile
                                </Link>
                              )}
                            </Menu.Item>
                          </>
                        ) : (
                          <>
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/dashboard/client"
                                  className={clsx(
                                    'group flex items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink
                                  )}
                                >
                                  <CalendarDaysIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                                  Events
                                </Link>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/inbox"
                                  className={clsx(
                                    'group flex items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink
                                  )}
                                >
                                  <ChatBubbleLeftEllipsisIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                                  Messages
                                </Link>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <Link
                                  href="/account"
                                  className={clsx(
                                    'group flex items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink
                                  )}
                                >
                                  <UserCircleIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                                  Edit Profile
                                </Link>
                              )}
                            </Menu.Item>
                          </>
                        )}

                        <div className="border-t border-slate-200 my-1" />

                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={logout}
                              className={clsx(
                                'group flex w-full items-center px-4 py-2 text-sm',
                                'text-black',
                                active && 'bg-slate-100',
                                hoverNeutralLink
                              )}
                            >
                              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-slate-500 group-hover:text-slate-600" />
                              Sign out
                            </button>
                          )}
                        </Menu.Item>
                      </div>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </>
            ) : (
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className={clsx(
                    'px-3 py-2 text-sm rounded-lg text-white hover:bg-gray-900',
                    hoverNeutralLink2
                  )}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={clsx(
                    'px-3 py-2 text-sm rounded-lg text-white hover:bg-gray-900',
                    hoverNeutralLink2
                  )}
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Search Area */}
        {!isArtistView && showSearchBar && (
          <div
            className={clsx(
              'relative mx-auto',
              'max-w-2xl',
              headerState === 'compacted' ? 'mt-0 mb-0' : 'mb-0'
            )}
          >
            {/* MOBILE overlay (pill lives in top row) */}
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
                showPill={false}
              />
            </div>

            {/* DESKTOP full SearchBar (white filter icon OUTSIDE right) */}
            <div
              ref={desktopSearchMountRef}
              className={clsx(
                'hidden md:block transition-all relative',
                headerState === 'compacted'
                  ? 'opacity-0 scale-y-0 h-0 pointer-events-none'
                  : 'opacity-100 scale-y-100 pointer-events-auto'
              )}
            >
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

              {/* Outside-right white filter icon */}
              {filterControl && (
                <FilterSlot className="hidden md:block right-[-44px]">
                  {filterControl}
                </FilterSlot>
              )}
            </div>
          </div>
        )}

        {/* Optional extra content bar */}
        {extraBar && (headerState === 'initial' || headerState === 'expanded-from-compact') && (
          <div className="mt-3">{extraBar}</div>
        )}
      </div>

      {/* Mobile drawer */}
      <MobileMenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={SHOW_CLIENT_TOP_NAV ? clientNav : []}
        user={user}
        logout={logout}
        pathname={pathname}
      />
    </header>
  );
});

Header.displayName = 'Header';
export default Header;
