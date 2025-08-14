// src/components/layout/MainLayout.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Header, { HeaderState } from './Header';
import MobileBottomNav from './MobileBottomNav';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import Footer from './Footer';
import useIsMobile from '@/hooks/useIsMobile';

const SCROLL_THRESHOLD_DOWN = 60; // Scroll down past this to compact
const SCROLL_THRESHOLD_UP = 10;   // Scroll up before this to expand (must be < SCROLL_THRESHOLD_DOWN)
const TRANSITION_DURATION = 500;  // Match Header's CSS transition duration in ms

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

  const isArtistDetail = /^\/service-providers\//.test(pathname) && pathname.split('/').length > 2;
  const isArtistsRoot = pathname === '/service-providers';
  const isArtistsPage = pathname.startsWith('/service-providers');
  const isArtistView = user?.user_type === 'service_provider' && artistViewActive;
  const isMobile = useIsMobile();

  // Header state – start compact to avoid flash on mobile
  const [headerState, setHeaderState] = useState<HeaderState>('compacted');

  // Decide initial state after knowing viewport
  useEffect(() => {
    if (isArtistView) {
      setHeaderState('initial');
    } else if (!isMobile && !isArtistsRoot) {
      setHeaderState('initial');
    } else {
      setHeaderState('compacted');
    }
  }, [isArtistView, isMobile, isArtistsRoot]);

  // Refs for scroll logic
  const prevScrollY = useRef(0);
  const isAdjustingScroll = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const prevHeaderHeight = useRef(0);

  // Track whether Header has locked compaction (mobile search open)
  const [headerLocked, setHeaderLocked] = useState(false);

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
    observer.observe(el, { attributes: true, attributeFilter: ['data-lock-compact'] });

    return () => observer.disconnect();
  }, []);

  // Only show the global overlay for the desktop expanded search (not for mobile)
  const showSearchOverlay =
    headerState === 'expanded-from-compact' &&
    !isArtistDetail &&
    !isArtistView &&
    !headerLocked;

  // Force header state from children (Header/Search)
  const forceHeaderState = useCallback(
    (state: HeaderState, scrollTarget?: number) => {
      if (headerRef.current?.dataset.lockCompact === 'true') return; // ignore while locked by mobile search

      // On mobile the header should stay compact unless explicitly expanded
      if (isMobile) {
        setHeaderState(state === 'expanded-from-compact' ? 'expanded-from-compact' : 'compacted');
        return;
      }

      // Lock the header in its initial state on service provider profile pages or artist view
      if (isArtistDetail || isArtistView) {
        setHeaderState('initial');
        return;
      }

      if (headerState === state) return;

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

      if (heightDifference !== 0 && window.scrollY > 0 && prevHeaderHeight.current !== 0) {
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
    if (isMobile || isArtistView) return; // No compaction in artist view or on mobile
    const headerIsLocked = headerRef.current?.dataset.lockCompact === 'true';
    if (headerIsLocked) return; // bail if mobile search is open

    const currentScrollY = window.scrollY;
    const scrollDirection = currentScrollY > prevScrollY.current ? 'down' : 'up';
    prevScrollY.current = currentScrollY;

    // If manually expanded or during programmatic scroll, do nothing
    if (headerState === 'expanded-from-compact' || isAdjustingScroll.current) return;

    // Hysteresis + snapping
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
    if (isArtistDetail || isArtistView || isMobile) return;

    window.addEventListener('scroll', optimizedScrollHandler, { passive: true });
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      handleScroll();
    }
    return () => {
      window.removeEventListener('scroll', optimizedScrollHandler);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isArtistDetail, isArtistView, isMobile, optimizedScrollHandler, handleScroll]);

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
              isArtistsPage || window.scrollY > SCROLL_THRESHOLD_DOWN ? 'compacted' : 'initial';
            const scrollTarget = !isArtistsPage && window.scrollY === 0 ? 0 : undefined;
            forceHeaderState(targetState, scrollTarget);
          }}
        />
      )}

      <div className="flex-grow">
        <Header
          ref={headerRef}
          headerState={headerState}
          onForceHeaderState={forceHeaderState}
          extraBar={isArtistsRoot ? <div className="mx-auto w-full px-4">{headerAddon}</div> : undefined}
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
            className={clsx(contentWrapperClasses, headerLocked && 'pointer-events-none select-none')}
            {...(headerLocked ? { inert: '' as any, 'aria-hidden': true } : {})}
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
