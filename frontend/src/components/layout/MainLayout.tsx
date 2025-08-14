// src/components/layout/MainLayout.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header, { HeaderState } from './Header';
import MobileBottomNav from './MobileBottomNav';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import Footer from './Footer';

const SCROLL_THRESHOLD_DOWN = 60; // desktop scroll behavior only
const SCROLL_THRESHOLD_UP = 10;
const TRANSITION_DURATION = 500;

// Simple hook to detect mobile viewport (client-only)
function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [breakpointPx]);
  return isMobile;
}

interface Props {
  children: React.ReactNode;
  headerAddon?: React.ReactNode;
  headerFilter?: React.ReactNode;
  fullWidthContent?: boolean;
  hideFooter?: boolean;
}

export default function MainLayout({
  children,
  headerAddon,
  headerFilter,
  fullWidthContent = false,
  hideFooter = false,
}: Props) {
  const { user, artistViewActive } = useAuth();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const isArtistDetail =
    /^\/service-providers\//.test(pathname) && pathname.split('/').length > 2;
  const isArtistsRoot = pathname === '/service-providers';
  const isArtistsPage = pathname.startsWith('/service-providers');
  const isArtistView =
    user?.user_type === 'service_provider' && artistViewActive;

  // Header state:
  // MOBILE: always 'initial' (we never compact on mobile)
  // DESKTOP: initial unless on /service-providers root (then start compacted)
  const [headerState, setHeaderState] = useState<HeaderState>('initial');

  // Refs for scroll logic
  const prevScrollY = useRef(0);
  const isAdjustingScroll = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const prevHeaderHeight = useRef(0);

  // Track whether Header has locked compaction (mobile search open)
  const [headerLocked, setHeaderLocked] = useState(false);

  // Set initial header state when viewport or route changes
  useEffect(() => {
    if (isArtistView) {
      setHeaderState('initial');
      return;
    }
    if (isMobile) {
      setHeaderState('initial');
    } else {
      setHeaderState(isArtistsRoot ? 'compacted' : 'initial');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isArtistsRoot, isArtistView, pathname]);

  // Keep a live view of the header lock via MutationObserver on data-lock-compact
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    setHeaderLocked(el.dataset.lockCompact === 'true');

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes' && m.attributeName === 'data-lock-compact') {
          setHeaderLocked(el.dataset.lockCompact === 'true');
        }
      }
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-lock-compact'],
    });

    return () => observer.disconnect();
  }, []);

  // Ensure header is shown whenever the mobile search is open/locked
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    if (headerLocked) {
      el.removeAttribute('data-hide-on-mobile');
    }
  }, [headerLocked]);

  // Optional: also reveal header on route change (prevents hidden header after nav)
  useEffect(() => {
    headerRef.current?.removeAttribute('data-hide-on-mobile');
  }, [pathname]);

  // Only show the global overlay for the desktop expanded search (not for mobile)
  const showSearchOverlay =
    headerState === 'expanded-from-compact' &&
    !isArtistDetail &&
    !isArtistView &&
    !headerLocked &&
    !isMobile;

  // Force header state from children (Header/Search)
  const forceHeaderState = useCallback(
    (state: HeaderState, scrollTarget?: number) => {
      if (headerRef.current?.dataset.lockCompact === 'true') return; // ignore while locked by mobile search

      // Lock the header in its initial state on service provider profile pages or artist view
      if (isArtistDetail || isArtistView) {
        setHeaderState('initial');
        return;
      }

      // MOBILE: never allow 'compacted'
      if (isMobile && state === 'compacted') {
        state = 'initial';
      }

      if (headerState === state) {
        // Optionally still handle scrollTarget even if state unchanged
        if (typeof scrollTarget === 'number') {
          isAdjustingScroll.current = true;
          window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          setTimeout(() => {
            isAdjustingScroll.current = false;
          }, TRANSITION_DURATION + 150);
        }
        return;
      }

      // Capture header height before change for later scroll compensation
      if (headerRef.current) {
        prevHeaderHeight.current = headerRef.current.offsetHeight;
      }

      setHeaderState(state);

      // Optional programmatic scroll
      if (typeof scrollTarget === 'number') {
        isAdjustingScroll.current = true;
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        setTimeout(() => {
          isAdjustingScroll.current = false;
        }, TRANSITION_DURATION + 150);
      }
    },
    [headerState, isArtistDetail, isArtistView, isMobile],
  );

  // Compensate content scroll after header height transitions (ORIGINAL)
  const adjustScrollAfterHeaderChange = useCallback(() => {
    if (isAdjustingScroll.current) return;

    if (headerRef.current) {
      const currentHeaderHeight = headerRef.current.offsetHeight;
      const heightDifference = currentHeaderHeight - prevHeaderHeight.current;

      if (
        heightDifference !== 0 &&
        window.scrollY > 0 &&
        prevHeaderHeight.current !== 0
      ) {
        isAdjustingScroll.current = true;
        window.scrollBy({ top: heightDifference, behavior: 'smooth' });
        setTimeout(() => {
          isAdjustingScroll.current = false;
        }, TRANSITION_DURATION + 550);
      }
    }
  }, []);

  // Main scroll handler:
  // - MOBILE: hide header on scroll down, show on scroll up/near top
  // - DESKTOP: keep your existing compact/expand logic
  const handleScroll = useCallback(() => {
    if (isArtistView) return; // No compaction in artist view

    // MOBILE path first
    if (isMobile) {
      const el = headerRef.current;
      if (!el) return;

      // don't hide while mobile search is open/locked
      const headerIsLocked = el.dataset.lockCompact === 'true';
      if (headerIsLocked) return;

      const y = window.scrollY;
      const delta = y - prevScrollY.current;
      prevScrollY.current = y;

      // small hysteresis so it doesn't flicker
      const DOWN_HIDE_THRESHOLD = 8; // px
      const UP_SHOW_THRESHOLD = 4; // px
      const TOP_SHOW_Y = 24; // keep visible near top

      if (y <= TOP_SHOW_Y || delta < -UP_SHOW_THRESHOLD) {
        // show when near top or scrolling up
        el.removeAttribute('data-hide-on-mobile');
      } else if (delta > DOWN_HIDE_THRESHOLD) {
        // hide when scrolling down
        el.setAttribute('data-hide-on-mobile', 'true');
      }
      return; // stop here; desktop compaction logic below is not used on mobile
    }

    // DESKTOP logic
    const headerIsLocked = headerRef.current?.dataset.lockCompact === 'true';
    if (headerIsLocked) return; // bail if search is open

    const currentScrollY = window.scrollY;
    const scrollDirection = currentScrollY > prevScrollY.current ? 'down' : 'up';
    prevScrollY.current = currentScrollY;

    // If manually expanded or during programmatic scroll, do nothing
    if (headerState === 'expanded-from-compact' || isAdjustingScroll.current) return;

    // Hysteresis + snapping (DESKTOP ONLY)
    if (scrollDirection === 'down') {
      if (currentScrollY > SCROLL_THRESHOLD_DOWN) {
        setHeaderState('compacted');
      } else if (
        currentScrollY >= SCROLL_THRESHOLD_UP &&
        currentScrollY <= SCROLL_THRESHOLD_DOWN
      ) {
        if (headerState === 'initial') {
          isAdjustingScroll.current = true;
          setHeaderState('compacted');
          window.scrollTo({ top: SCROLL_THRESHOLD_DOWN + 1, behavior: 'smooth' });
          setTimeout(() => {
            isAdjustingScroll.current = false;
          }, TRANSITION_DURATION + 150);
        }
      }
    } else {
      // scrolling up
      if (!isArtistsPage) {
        if (currentScrollY < SCROLL_THRESHOLD_UP) {
          setHeaderState('initial');
        } else if (
          currentScrollY >= SCROLL_THRESHOLD_UP &&
          currentScrollY <= SCROLL_THRESHOLD_DOWN
        ) {
          if (headerState === 'compacted') {
            isAdjustingScroll.current = true;
            setHeaderState('initial');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
              isAdjustingScroll.current = false;
            }, TRANSITION_DURATION + 150);
          }
        }
      }
    }
  }, [headerState, isArtistsPage, isArtistView, isMobile]);

  // rAF-optimized scroll listener
  const optimizedScrollHandler = useCallback(() => {
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    animationFrameId.current = requestAnimationFrame(handleScroll);
  }, [handleScroll]);

  // Attach/detach scroll listener
  useEffect(() => {
    if (isArtistDetail || isArtistView) return;

    window.addEventListener('scroll', optimizedScrollHandler, { passive: true });
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      handleScroll();
    }
    return () => {
      window.removeEventListener('scroll', optimizedScrollHandler);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isArtistDetail, isArtistView, optimizedScrollHandler, handleScroll]);

  // Body scroll lock for desktop expanded overlay only
  useEffect(() => {
    if (showSearchOverlay) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
  }, [showSearchOverlay]);

  // Keep CSS var with header height in sync; adjust after transitions (ORIGINAL listener)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setHeaderVar = () => {
      const h = el.offsetHeight || 64;
      document.documentElement.style.setProperty('--app-header-height', `${h}px`);
    };
    setHeaderVar();

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => setHeaderVar());
      ro.observe(el);
    } catch {
      window.addEventListener('resize', setHeaderVar);
    }

    const transitionEndHandler = (event: TransitionEvent) => {
      if (event.propertyName === 'max-height') {
        adjustScrollAfterHeaderChange();
        setHeaderVar();
      }
    };
    el.addEventListener('transitionend', transitionEndHandler);

    return () => {
      el.removeEventListener('transitionend', transitionEndHandler);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', setHeaderVar);
    };
  }, [adjustScrollAfterHeaderChange]);

  const contentWrapperClasses = fullWidthContent ? 'w-full' : 'w-full';

  const showSearchBar =
    !isArtistDetail &&
    !isArtistView &&
    (pathname === '/' || pathname.startsWith('/service-providers'));

  return (
    <div className="flex min-h-screen flex-col bg-white bg-gradient-to-b from-brand-light/50 to-gray-50">
      {/* Desktop expanded overlay (suppressed when header is locked by mobile search) */}
      {showSearchOverlay && (
        <div
          id="expanded-search-overlay"
          className="fixed inset-0 bg-black bg-opacity-90 z-40 animate-fadeIn"
          onClick={() => {
            if (headerRef.current?.dataset.lockCompact === 'true') return;
            const targetState =
              isArtistsPage || window.scrollY > SCROLL_THRESHOLD_DOWN
                ? 'compacted'
                : 'initial';
            const scrollTarget =
              !isArtistsPage && window.scrollY === 0 ? 0 : undefined;
            forceHeaderState(targetState, scrollTarget);
          }}
        />
      )}

      <div className="flex-grow">
        <Header
          ref={headerRef}
          headerState={headerState}
          onForceHeaderState={forceHeaderState}
          extraBar={
            isArtistsRoot ? (
              <div className="mx-auto w-full px-4">{headerAddon}</div>
            ) : undefined
          }
          showSearchBar={showSearchBar}
          filterControl={headerFilter}
        />

        {/* Mobile search overlay (outside header, covers page content) */}
        {headerLocked && (
          <div
            id="mobile-search-overlay"
            className="fixed inset-0 z-40 bg-gradient-to-br from-[#EEF3FA]/100 via-[#F7FAFF]/100 to-[#F6F3EF]/100 md:hidden transition-opacity"
            aria-hidden="true"
            onClick={() => {
              // Tell MobileSearch to close when the overlay is tapped
              window.dispatchEvent(new CustomEvent('mobile-search:backdrop'));
            }}
          />
        )}

        {/* CONTENT (has a stable id so we can set inert while mobile search is open) */}
        <main
          className={clsx('', {})}
          style={{ paddingBottom: 'var(--mobile-bottom-nav-height, 0px)' }}
        >
          <div
            id="app-content"
            className={clsx(
              contentWrapperClasses,
              headerLocked && 'pointer-events-none select-none',
            )}
            {...(headerLocked ? ({ inert: '' } as any) : {})}
          >
            {children}
          </div>
        </main>
      </div>

      {!hideFooter && <Footer />}

      {user && <MobileBottomNav user={user} />}
    </div>
  );
}
