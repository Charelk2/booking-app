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
  ArrowRightOnRectangleIcon,
  CalendarIcon,
  SparklesIcon,
  // kept for parity (unused here)
  FilmIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  MicrophoneIcon,
  TicketIcon,
  FaceSmileIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';

import { useAuth } from '@/contexts/AuthContext';
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
import { FEATURE_EVENT_PREP, FEATURE_HEADER_LIGHT } from '@/lib/constants';
import dynamic from 'next/dynamic';
const ProviderOnboardingModal = dynamic(() => import('@/components/auth/ProviderOnboardingModal'), { ssr: false });
import useIsMobile from '@/hooks/useIsMobile';
import { UserAccountIcon } from '../icons/UserAccountIcon';

  // (Notifications UI dynamically loaded elsewhere if needed)

export type HeaderState = 'initial' | 'compacted' | 'expanded-from-compact';

type SearchParamsShape = {
  category?: string;
  location?: string;
  when?: Date | null;
};

const SHOW_CLIENT_TOP_NAV = false;

const clientNav = [
  { name: 'Services', href: '/services' },
  { name: 'Contact', href: '/contact' },
];

// Compute current path + query for return-to behavior after auth
const useCurrentPathWithQuery = () => {
  const pathname = usePathname();
  const params = useSearchParams();
  return useMemo(() => {
    const q = params?.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, params]);
};

// Shared classes to *ensure* no red/underline on hover
const hoverNeutralLink =
  'no-underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';
const hoverNeutralLink2 =
  'no-underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

// Filter icon overlay: theme-aware icon/text; supports placing it *outside* on the right
function FilterSlot({
  children,
  className = '',
  isLightHeader,
}: {
  children: React.ReactNode;
  className?: string;
  isLightHeader: boolean;
}) {
  const themeClasses = isLightHeader
    ? 'text-black [&_svg]:!text-black [&_svg]:!stroke-black [&_*]:!text-black'
    : 'text-white [&_svg]:!text-white [&_svg]:!stroke-white [&_*]:!text-white';

  return (
    <div
      className={clsx(
        'pointer-events-none absolute top-1/2 -translate-y-1/2 z-20',
        themeClasses,
        className
      )}
      aria-hidden="false"
    >
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}

function ClientNav({ pathname, isLightHeader }: { pathname: string; isLightHeader: boolean }) {
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
              isLightHeader
                ? 'text-gray-900 hover:text-black'
                : 'text-white/90 hover:text-white',
              hoverNeutralLink,
              isActive && (isLightHeader ? 'font-semibold text-black' : 'font-semibold text-white')
            )}
          >
            {item.name}
          </Link>
        );
      })}
    </>
  );
}

function ArtistNav({
  user,
  pathname,
  isLightHeader,
}: {
  user: { id: number; artist_slug?: string | null };
  pathname: string;
  isLightHeader: boolean;
}) {
  const items = [
    { name: 'Today', href: '/dashboard/today' },
    { name: 'View Profile', href: `/${user.artist_slug || user.id}` },
    // Note: /dashboard redirects to /dashboard/artist and drops query params.
    // Keep a stable direct link to the provider dashboard.
    { name: 'Dashboard', href: '/dashboard/artist' },
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
              isLightHeader
                ? 'text-gray-900 hover:text-black'
                : 'text-white/90 hover:text-white',
              hoverNeutralLink,
              isActive && (isLightHeader ? 'font-semibold text-black' : 'font-semibold text-white')
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
function HeaderMessagesLink({ unread, isLightHeader }: { unread: number; isLightHeader: boolean }) {
  const router = useRouter();
  return (
    <Link
      href="/inbox"
      className={clsx(
        'relative inline-flex items-center justify-center px-2 py-2 rounded-lg hover:no-underline',
        isLightHeader
          ? 'text-black hover:bg-gray-200'
          : 'text-white hover:bg-gray-200'
      )}
      aria-label={unread > 0 ? `Messages (${unread} unread)` : 'Messages'}
      onMouseEnter={() => router.prefetch?.('/inbox')}
      onFocus={() => router.prefetch?.('/inbox')}
    >
      {unread > 0 ? (
        <ChatBubbleLeftRightIcon className="h-6 w-6" />
      ) : (
        <ChatOutline className="h-6 w-6" />
      )}
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none px-1"
          aria-label={`${unread} unread messages`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

// Placeholder to attach any global styles or preloading if needed later
HeaderMessagesLink.Definition = function Definition() {
  // Removed idle prefetch of "/inbox" to avoid pulling the Inbox route
  // bundle into the very first paint. We still prefetch on hover/focus via
  // the HeaderMessagesLink anchors above.
  return null;
};

function HeaderMessagesLinkMobile({
  unread,
  variant,
}: {
  unread: number;
  variant: 'default' | 'auth';
}) {
  const router = useRouter();
  return (
    <Link
      href="/inbox"
      className={clsx(
        'md:hidden p-2 rounded-xl transition relative hover:no-underline',
        variant === 'auth'
          ? 'text-gray-900 hover:bg-gray-100'
          : 'text-white hover:bg-gray-900 hover:text-white'
      )}
      aria-label={unread > 0 ? `Messages (${unread} unread)` : 'Messages'}
      onMouseEnter={() => router.prefetch?.('/inbox')}
      onFocus={() => router.prefetch?.('/inbox')}
    >
      {unread > 0 ? (
        <ChatBubbleLeftRightIcon className="h-6 w-6" />
      ) : (
        <ChatOutline className="h-6 w-6" />
      )}
      {unread > 0 && (
        <span
          className="absolute -top-1 -right-1 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none px-1"
          aria-label={`${unread} unread messages`}
        >
          {unread > 99 ? '99+' : unread}
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
  variant?: 'default' | 'auth';
  hideAccountActions?: boolean;
}

const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    extraBar,
    headerState,
    onForceHeaderState,
    showSearchBar = true,
    filterControl,
    variant = 'default',
    hideAccountActions = false,
  },
  ref,
) {
  const { user, logout, artistViewActive, toggleArtistView } = useAuth();
  const { count: unreadThreadsCount } = useUnreadThreadsCount();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isArtistView = user?.user_type === 'service_provider' && artistViewActive;
  const isClientUser = user?.user_type === 'client';
  const headerVariant = variant;
  const isAuthVariant = headerVariant === 'auth';
  const isLightHeader = isAuthVariant || FEATURE_HEADER_LIGHT;
  const suppressAccountActions = hideAccountActions;

  const [menuOpen, setMenuOpen] = useState(false);
  const [showProviderOnboarding, setShowProviderOnboarding] = useState(false);
  const [providerOnboardingNext, setProviderOnboardingNext] = useState<string | undefined>(undefined);
  const isMobile = useIsMobile();
  const [currentBookingId, setCurrentBookingId] = useState<number | null>(null);

  // Listen for booking context emitted by thread pages
  useEffect(() => {
    const update = () => {
      try {
        const bid = (window as any).__currentBookingId;
        setCurrentBookingId(typeof bid === 'number' && !Number.isNaN(bid) ? bid : null);
      } catch { setCurrentBookingId(null); }
    };
    update();
    window.addEventListener('booking:context', update as any);
    return () => window.removeEventListener('booking:context', update as any);
  }, []);

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

  // Build return URL (path + query) for auth redirects
  const nextAfterAuth = useMemo(() => {
    const q = searchParams?.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [pathname, searchParams]);

  // Global controller for provider onboarding modal
  useEffect(() => {
    const onOpen = (e: Event) => {
      try {
        const detail = (e as CustomEvent<any>).detail || {};
        setProviderOnboardingNext(typeof detail.next === 'string' ? detail.next : '/dashboard/artist');
      } catch {
        setProviderOnboardingNext('/dashboard/artist');
      }
      setShowProviderOnboarding(true);
    };
    window.addEventListener('provider:onboarding-open', onOpen as any);
    return () => window.removeEventListener('provider:onboarding-open', onOpen as any);
  }, []);

  const goToLogin = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/auth?intent=login&next=${encodeURIComponent(nextAfterAuth)}`);
  }, [router, nextAfterAuth]);

  const goToRegister = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    router.push(`/auth?intent=signup&next=${encodeURIComponent(nextAfterAuth)}`);
  }, [router, nextAfterAuth]);

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

      // Attach a per-search identifier so the artists page can log analytics.
      try {
        const hasCrypto = typeof window !== 'undefined' && (window.crypto as Crypto | undefined);
        const searchId =
          hasCrypto && (window.crypto as Crypto).randomUUID
            ? (window.crypto as Crypto).randomUUID()
            : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        params.set('sid', searchId);
        params.set('src', 'header');
      } catch {
        // If anything goes wrong, skip analytics identifiers.
      }

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
    'z-50',
    // Keep header pinned to the top on all viewports
    'fixed top-0 left-0 right-0',
    isLightHeader
      ? 'bg-white/95 supports-[backdrop-filter]:backdrop-blur-sm'
      : 'bg-black supports-[backdrop-filter]:backdrop-blur-md'
  );

  const topRowClasses = clsx(
    'grid px-2 grid-cols-[auto,1fr,auto] items-center gap-2',
    isLightHeader ? 'bg-transparent text-gray-900' : 'bg-black text-white'
  );

  const menuButtonClasses = clsx(
    'md:hidden p-2 rounded-xl transition',
    isLightHeader
      ? 'text-gray-900 hover:bg-gray-100 active:bg-gray-200'
      : 'hover:bg-white/10 active:bg-white/15 text-white'
  );

  const brandLinkClasses = clsx(
    'font-bold tracking-tight no-underline hover:no-underline transition-transform duration-200 hover:scale-110',
    isLightHeader
      ? 'text-gray-900 hover:text-gray-900 focus-visible:ring-black/20'
      : 'text-white hover:text-white focus-visible:ring-white/50',
    'rounded-md px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    isLightHeader ? 'focus-visible:ring-offset-white' : 'focus-visible:ring-offset-black'
  );

  return (
    <>
    <header
      ref={ref}
      id="app-header"
      className={headerClasses}
      data-header-state={headerState}
      data-lock-compact={mobileSearchOpen ? 'true' : 'false'}
    >
      <HeaderMessagesLink.Definition />
      <div
        className={clsx(
          'mx-auto full-width w-full px-3 sm:px-6 lg:px-8',
          !pathname.startsWith('/inbox') && 'max-w-7xl',
        )}
      >
        {/* Top Row */}
        <div className={topRowClasses}>
          {/* Left: brand + (mobile pill) */}
          <div className="col-span-3 md:col-span-1 flex items-center w-full min-w-0 justify-between">
            <div className="flex items-center gap-2 w-full min-w-0">
              <Link
                href="/"
                prefetch={false}
                className={clsx(brandLinkClasses, 'flex items-center gap-2')}
                aria-label="Booka home"
              >
                {(() => {
                  const src = process.env.NEXT_PUBLIC_BRAND_LOGO_URL || '';
                  const logoBgClasses = isLightHeader ? 'bg-black' : 'bg-white';
                  const logoTextClasses = isLightHeader ? 'text-white' : 'text-black';
                  return (
                    <span
                      className={clsx(
                        'inline-flex items-center justify-center h-8 w-8 sm:h-8 sm:w-8 md:h-8 md:w-8 rounded',
                        logoBgClasses,
                      )}
                    >
                      {src ? (
                        <Image
                          src={src}
                          alt="Brand logo"
                          width={30}
                          height={30}
                          priority
                          className="h-5 w-auto sm:h-6 md:h-7"
                        />
                      ) : (
                        <span
                          className={clsx(
                            logoTextClasses,
                            'font-black text-xl sm:text-2xl md:text-3xl leading-none',
                          )}
                        >
                          B
                        </span>
                      )}
                    </span>
                  );
                })()}
                <span className="text-lg sm:text-2xl md:text-3xl">Booka</span>
              </Link>

              {/* MOBILE: search pill (light surface → black text) */}
              {!isArtistView && showSearchBar && (
                <button
                  type="button"
                  onClick={() => mobileSearchRef.current?.open?.()}
                  aria-label="Open search"
                  className={clsx(
                    'ml-2 md:hidden inline-flex items-center gap-2 px-3 py-2 text-xs rounded-lg',
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
            </div>

            {/* MOBILE: filter icon + hamburger on the right */}
            <div className="flex items-center gap-2 md:hidden ml-2 shrink-0">
              {filterControl && (
                <div
                  className={clsx(
                    'shrink-0 [&_svg]:!stroke-inherit [&_*]:!text-inherit',
                    isLightHeader
                      ? 'text-gray-900 [&_svg]:!text-gray-900'
                      : 'text-white [&_svg]:!text-white'
                  )}
                >
                  {filterControl}
                </div>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                className={clsx(menuButtonClasses, hoverNeutralLink)}
              >
                <Bars3Icon className={clsx('h-6 w-6', isLightHeader ? 'text-gray-900' : 'text-white')} />
              </button>
            </div>
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
                <ArtistNav user={user} pathname={pathname} isLightHeader={isLightHeader} />
              ) : SHOW_CLIENT_TOP_NAV ? (
                <ClientNav pathname={pathname} isLightHeader={isLightHeader} />
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
                <div className="relative w-full max-w-lg">
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
                      'w-full flex items-center border justify-between rounded-lg',
                      'bg-white',
                      // extra right padding is not needed since icon is *outside*
                      'px-4 py-2 text-sm',
                      hoverNeutralLink,
                      'text-black'
                    )}
                  >
                    <div className="flex flex-1 divide-x divide-slate-200">
                      <div className="flex-1 px-2 truncate">
                        {category ? (
                          <span className="text-xs text-black truncate">
                            {category.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600 truncate">
                            Add service
                          </span>
                        )}
                      </div>
                      <div className="flex-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis">
                        {location ? (
                          <span className="text-xs text-black whitespace-nowrap overflow-hidden text-ellipsis">
                            {getStreetFromAddress(location)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                            Add location
                          </span>
                        )}
                      </div>
                      <div className="flex-1 px-2 truncate">
                        {when ? (
                          <span className="text-xs text-black truncate">
                            {dateFormatter.format(when)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600 truncate">
                            Add dates
                          </span>
                        )}
                      </div>
                    </div>
                    <MagnifyingGlassIcon className="ml-3 h-5 w-5 text-slate-600 shrink-0" />
                  </button>

                  {/* Outside-right white filter icon */}
                  {filterControl && (
                    <FilterSlot
                      className="hidden md:block right-[-44px]"
                      isLightHeader={isLightHeader}
                    >
                      {filterControl}
                    </FilterSlot>
                  )}
                </div>
              </div>
            )}
          </div>

            {/* Right actions */}
            <div className="hidden sm:flex items-center justify-end gap-2">
              {!suppressAccountActions && (
                user ? (
                  <>
                  {user.user_type === 'service_provider' && (
                    <button
                      onClick={toggleArtistView}
                      className={clsx(
                        'px-2 py-1.5 text-sm rounded-lg font-semibold',
                        isLightHeader
                          ? 'bg-white text-black hover:bg-gray-100'
                          : 'bg-black text-white hover:bg-gray-900'
                      )}
                    >
                    {artistViewActive ? 'Switch to Booking' : 'Switch to Hosting'}
                  </button>
                )}
                  {user.user_type === 'client' && (
                    <button
                      onClick={() => { setProviderOnboardingNext('/dashboard/artist'); setShowProviderOnboarding(true); }}
                      className={clsx(
                        'px-2 py-1.5 text-sm rounded-lg font-semibold',
                        isLightHeader
                          ? 'bg-white text-black hover:bg-black hover:text-white'
                          : 'bg-black text-white hover:bg-white hover:text-black',
                        hoverNeutralLink2
                      )}
                    >
                      List your service
                    </button>
                  )}
                  {/* Messages link with unread badge (no flicker) */}
                  <HeaderMessagesLink unread={unreadThreadsCount} isLightHeader={isLightHeader} />

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
                      size={34}
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
                    <Menu.Items className="absolute right-0 mt-2 w-72 origin-top-right bg-white rounded-xl shadow-xl ring-1 ring-black/5 focus:outline-none z-50">
                      {/* Profile summary */}
                      <div className="px-4 py-3 flex items-center gap-3">
                        <Avatar
                          src={user.profile_picture_url || null}
                          initials={user.first_name?.[0] || user.email[0]}
                          size={44}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {user.first_name || user.email?.split('@')[0]}
                          </p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="border-t border-slate-200" />
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
                                    hoverNeutralLink2
                                  )}
                                >
                                  <CalendarIcon className="mr-3 h-5 w-5 text-black" />
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
                                  hoverNeutralLink2
                                  )}
                                >
                                  <UserAccountIcon className="mr-3 h-5 w-5 text-black" />
                                  Edit Profile
                                </Link>
                              )}
                            </Menu.Item>
                          </>
                        ) : (
                          <>
                            {/* Client-only: quick upgrade to provider */}
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  type="button"
                                  onClick={() => { setProviderOnboardingNext('/dashboard/artist'); setShowProviderOnboarding(true); }}
                                  className={clsx(
                                    'group flex w-full items-center px-4 py-2 text-sm',
                                    'text-black',
                                    active && 'bg-slate-100',
                                    hoverNeutralLink2
                                  )}
                                >
                                  <SparklesIcon className="mr-3 h-5 w-5 text-black transform transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110" />
                                  List your service
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                            {({ active }) => (
                              <Link
                                href="/dashboard/client"
                                className={clsx(
                                  'group flex items-center px-4 py-2 text-sm',
                                  'text-black',
                                  active && 'bg-slate-100',
                                  hoverNeutralLink2
                                  )}
                                >
                                  <CalendarIcon className="mr-3 h-5 w-5 text-black" />
                                  Dashboard
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
                                  hoverNeutralLink2
                                  )}
                                >
                                  <ChatOutline className="mr-3 h-5 w-5 text-black" />
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
                                  hoverNeutralLink2
                                  )}
                                >
                                  <UserAccountIcon className="mr-3 h-5 w-5 text-black" />
                                  Edit Profile
                                </Link>
                              )}
                            </Menu.Item>
                          </>
                        )}

                        <div className="border-t border-slate-200 my-1" />
                        {FEATURE_EVENT_PREP && currentBookingId && (
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                href={`/dashboard/events/${currentBookingId}`}
                                className={clsx(
                                  'group flex items-center px-4 py-2 text-sm',
                                  'text-black',
                                  active && 'bg-slate-100',
                                  hoverNeutralLink2
                                )}
                              >
                                <CalendarIcon className="mr-3 h-5 w-5 text-black" />
                                Event Prep
                              </Link>
                            )}
                          </Menu.Item>
                        )}

                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={logout}
                              className={clsx(
                                'group flex w-full items-center px-4 py-2 text-sm',
                                active ? 'bg-red-50 text-red-700' : 'text-red-600',
                                hoverNeutralLink2
                              )}
                            >
                              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" />
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
                  {(!user || isClientUser) && (
                    user ? (
                      <button
                        onClick={() => { setProviderOnboardingNext('/dashboard/artist'); setShowProviderOnboarding(true); }}
                        className={clsx(
                          'px-1.5 py-1.5 text-sm rounded-lg bg-black text-white font-semibold hover:bg-gray-100 hover:text-black',
                          hoverNeutralLink2
                        )}
                      >
                        List your service
                      </button>
                      ) : (
                        <Link
                          href="/auth?intent=signup&role=service_provider&next=/onboarding/provider"
                        onClick={(e) => {
                          e.preventDefault();
                          // If signed in (client), open modal directly
                          if (user) {
                            setProviderOnboardingNext('/dashboard/artist');
                            setShowProviderOnboarding(true);
                          } else {
                            router.push(`/auth?intent=signup&role=service_provider&next=${encodeURIComponent('/onboarding/provider')}`);
                          }
                          }}
                          className={clsx(
                            'px-2 py-1.5 text-sm rounded-lg font-semibold',
                            isLightHeader
                              ? 'bg-white text-black hover:bg-black hover:text-white'
                              : 'bg-black text-white hover:bg-gray-100 hover:text-black',
                            hoverNeutralLink2
                          )}
                      >
                        List your service
                      </Link>
                    )
                  )}
                  <button
                    type="button"
                    onClick={goToLogin}
                    aria-label="Account"
                    className={clsx('p-0', isLightHeader ? 'text-black' : 'text-white')}
                  >
                    <UserAccountIcon className="h-7 w-7" />
                  </button>
                </div>
              )
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
                    <FilterSlot
                      className="hidden md:block right-[-44px]"
                      isLightHeader={isLightHeader}
                    >
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
        artistViewActive={artistViewActive}
        toggleArtistView={toggleArtistView}
        logout={logout}
        pathname={pathname}
        hideAuthLinks={suppressAccountActions}
      />

      {/* Notifications UI removed from dropdown per request */}
    </header>
    {showProviderOnboarding && (
      <ProviderOnboardingModal isOpen={showProviderOnboarding} onClose={() => setShowProviderOnboarding(false)} next={providerOnboardingNext} />
    )}
    </>
  );
});

Header.displayName = 'Header';
export default Header;
