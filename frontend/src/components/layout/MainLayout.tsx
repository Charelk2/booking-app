'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header, { HeaderState } from './Header';
import MobileBottomNav from './MobileBottomNav';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import Footer from './Footer';
import { Analytics } from '@vercel/analytics/react';

const SCROLL_THRESHOLD_DOWN = 60; // desktop scroll behavior only
const SCROLL_THRESHOLD_UP = 10;
const TRANSITION_DURATION = 500;

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
  const isArtistsPage =
    pathname.startsWith('/service-providers') || pathname.startsWith('/category');
  const isArtistView =
    user?.user_type === 'service_provider' && artistViewActive;

  const [headerState, setHeaderState] = useState<HeaderState>('initial');

  // Scroll/transition refs
  const prevScrollY = useRef(0);
  const isAdjustingScroll = useRef(false); // also used as our short-term "manual expand guard"
  const animationFrameId = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const prevHeaderHeight = useRef(0);

  const [headerLocked, setHeaderLocked] = useState(false);

  // Overlay arming — prevents initial open click from closing immediately
  const [overlayArmed, setOverlayArmed] = useState(false);
  const showSearchOverlay =
    headerState === 'expanded-from-compact' &&
    !isArtistDetail &&
    !isArtistView &&
    !headerLocked &&
    !isMobile;

  useEffect(() => {
    if (!showSearchOverlay) {
      setOverlayArmed(false);
      return;
    }
    setOverlayArmed(false);
    const t = setTimeout(() => setOverlayArmed(true), 180);
    return () => clearTimeout(t);
  }, [showSearchOverlay]);

  // Initial header state
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

  // Watch data-lock-compact from Header (mobile search)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    setHeaderLocked(el.dataset.lockCompact === 'true');

    const observer = new MutationObserver(() => {
      setHeaderLocked(el.dataset.lockCompact === 'true');
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['data-lock-compact'],
    });

    return () => observer.disconnect();
  }, []);

  // Ensure header is shown whenever mobile search is open
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    if (headerLocked) {
      el.removeAttribute('data-hide-on-mobile');
    }
  }, [headerLocked]);

  // Reveal header on route change
  useEffect(() => {
    headerRef.current?.removeAttribute('data-hide-on-mobile');
  }, [pathname]);

  // Force header state (called from Header)
  const forceHeaderState = useCallback(
    (state: HeaderState, scrollTarget?: number) => {
      const headerIsLocked = headerRef.current?.dataset.lockCompact === 'true';
      if (headerIsLocked) return;

      if (isArtistDetail || isArtistView) {
        setHeaderState('initial');
        return;
      }

      // MOBILE: never allow 'compacted'
      if (isMobile && state === 'compacted') {
        state = 'initial';
      }

      // Capture height for possible compensation
      if (headerRef.current) {
        prevHeaderHeight.current = headerRef.current.offsetHeight;
      }

      // **Key fix**: when expanding from compact -> full, guard scroll handler briefly
      if (state === 'expanded-from-compact') {
        isAdjustingScroll.current = true;
        prevScrollY.current = window.scrollY; // resync direction baseline
        setHeaderState('expanded-from-compact');
        setTimeout(() => {
          isAdjustingScroll.current = false;
        }, TRANSITION_DURATION + 150); // ~650ms guard
        return;
      }

      if (headerState === state) {
        if (typeof scrollTarget === 'number') {
          isAdjustingScroll.current = true;
          window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          setTimeout(() => {
            isAdjustingScroll.current = false;
          }, TRANSITION_DURATION + 150);
        }
        return;
      }

      setHeaderState(state);

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

  // Adjust scroll after header height change
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

  // Main scroll handler
  const handleScroll = useCallback(() => {
    if (isArtistView) return;

    // Guard period after manual expand
    if (isAdjustingScroll.current) return;

    // MOBILE path
    if (isMobile) {
      const el = headerRef.current;
      if (!el) return;

      const headerIsLocked = el.dataset.lockCompact === 'true';
      if (headerIsLocked) return;

      const y = window.scrollY;
      const delta = y - prevScrollY.current;
      prevScrollY.current = y;

      const DOWN_HIDE_THRESHOLD = 8;
      const UP_SHOW_THRESHOLD = 4;
      const TOP_SHOW_Y = 24;

      if (y <= TOP_SHOW_Y || delta < -UP_SHOW_THRESHOLD) {
        el.removeAttribute('data-hide-on-mobile');
      } else if (delta > DOWN_HIDE_THRESHOLD) {
        el.setAttribute('data-hide-on-mobile', 'true');
      }
      return;
    }

    // DESKTOP path
    const headerIsLocked = headerRef.current?.dataset.lockCompact === 'true';
    if (headerIsLocked) return;

    const currentScrollY = window.scrollY;
    const scrollDirection = currentScrollY > prevScrollY.current ? 'down' : 'up';
    prevScrollY.current = currentScrollY;

    // Do nothing while expanded (manual mode)
    if (headerState === 'expanded-from-compact') return;

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

  // rAF scroll listener
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

  // Keep CSS var with header height in sync; adjust after transitions
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
    (pathname === '/' || pathname.startsWith('/service-providers') || pathname.startsWith('/category'));

  return (
    <div className="flex min-h-screen flex-col bg-white bg-gradient-to-b from-brand-light/50 to-gray-50">
      {/* Desktop expanded overlay */}
      {showSearchOverlay && (
        <div
          id="expanded-search-overlay"
          className={clsx(
            'fixed inset-0 bg-black bg-opacity-90 z-40 animate-fadeIn',
            !overlayArmed && 'pointer-events-none',
          )}
          onMouseDown={(e) => {
            if (!overlayArmed) return;
            if (headerRef.current?.dataset.lockCompact === 'true') return;
            e.stopPropagation();

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
            headerAddon ? (
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
              window.dispatchEvent(new CustomEvent('mobile-search:backdrop'));
            }}
          />
        )}

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

      {/* Vercel Analytics */}
      <Analytics />
    </div>
  );
}
