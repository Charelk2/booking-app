// src/components/layout/MainLayout.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import { useAuth } from '@/contexts/AuthContext';
import Header, { HeaderState } from './Header'; // Import HeaderState
import MobileBottomNav from './MobileBottomNav';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import Footer from './Footer';


const SCROLL_THRESHOLD_DOWN = 60; // Scroll down past this to compact
const SCROLL_THRESHOLD_UP = 10;    // Scroll up before this to expand (must be < SCROLL_THRESHOLD_DOWN)
const TRANSITION_DURATION = 300; // Match Header's CSS transition duration in ms


interface Props {
  children: React.ReactNode;
  headerAddon?: React.ReactNode;
  headerFilter?: React.ReactNode;
  fullWidthContent?: boolean;
  hideFooter?: boolean;
}

export default function MainLayout({ children, headerAddon, headerFilter, fullWidthContent = false, hideFooter = false }: Props) {
  const { user, artistViewActive } = useAuth();
  const pathname = usePathname();
  const isArtistDetail = /^\/artists\//.test(pathname) && pathname.split('/').length > 2;
  const isArtistsRoot = pathname === '/artists';
  const isArtistsPage = pathname.startsWith('/artists');

  // State to manage the header's visual and functional state
  const [headerState, setHeaderState] = useState<HeaderState>(
    isArtistsRoot ? 'compacted' : 'initial',
  );

  // Refs for scroll logic
  const prevScrollY = useRef(0);
  const isAdjustingScroll = useRef(false);
  const animationFrameId = useRef<number | null>(null);
  const headerRef = useRef<HTMLElement>(null); // Ref to get header height
  const prevHeaderHeight = useRef(0); // Store header height before state change

  // Boolean derived from headerState to control global overlay visibility
  const showSearchOverlay =
    headerState === 'expanded-from-compact' && !isArtistDetail;


  // Callback to force header state (e.g., when compact search is clicked or search is submitted)
  // This function is passed to the Header component.
  const forceHeaderState = useCallback(
    (state: HeaderState, scrollTarget?: number) => {
      // Lock the header in its initial state on artist profile pages
      if (isArtistDetail) {
        setHeaderState('initial');
        return;
      }

      // Only update state if it's actually changing
      if (headerState === state) return;

      // Capture current header height before state change (for later scroll adjustment)
      if (headerRef.current) {
        prevHeaderHeight.current = headerRef.current.offsetHeight;
      }

      setHeaderState(state);

      // If a specific scroll target is provided, initiate programmatic scroll
      if (typeof scrollTarget === 'number') {
        isAdjustingScroll.current = true;
        window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
        // Reset flag after scroll is expected to complete
        setTimeout(() => {
          isAdjustingScroll.current = false;
        }, TRANSITION_DURATION + 150);
      }
    },
    [headerState, isArtistDetail],
  ); // Depend on headerState to prevent stale closures

  // Function to adjust scroll after header's height transition
  const adjustScrollAfterHeaderChange = useCallback(() => {
    // Do not adjust if we are already in a programmatic scroll (e.g., snapping)
    if (isAdjustingScroll.current) {
        return;
    }

    if (headerRef.current) {
        const currentHeaderHeight = headerRef.current.offsetHeight;
        const heightDifference = currentHeaderHeight - prevHeaderHeight.current;

        // Only adjust scroll if there's a significant height change
        // and we are not at the very top of the page (where scrollY is 0)
        // and prevHeaderHeight is valid (not 0 from initial load)
        if (heightDifference !== 0 && window.scrollY > 0 && prevHeaderHeight.current !== 0) {
            isAdjustingScroll.current = true; // Set flag
            window.scrollBy({
                top: heightDifference,
                behavior: 'smooth'
            });
            setTimeout(() => {
                isAdjustingScroll.current = false; // Reset flag after scroll settles
            }, TRANSITION_DURATION + 550);
        }
    }
  }, []); // No dependencies needed as refs are mutable

  // Main scroll handler for state changes and snapping
  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY;
    const scrollDirection = currentScrollY > prevScrollY.current ? 'down' : 'up';
    prevScrollY.current = currentScrollY; // Update previous scroll position

    // If header is manually expanded, or if programmatic scroll is active, do nothing
    if (headerState === 'expanded-from-compact' || isAdjustingScroll.current) {
      return;
    }

    // --- Core Logic: Hysteresis and Auto-Snapping ---
    if (scrollDirection === 'down') {
      if (currentScrollY > SCROLL_THRESHOLD_DOWN) {
        setHeaderState('compacted');
      } else if (currentScrollY >= SCROLL_THRESHOLD_UP && currentScrollY <= SCROLL_THRESHOLD_DOWN) {
        // User is in the dead zone, scrolling down, and header is initial: snap to compacted
        if (headerState === 'initial') {
          isAdjustingScroll.current = true; // Block further scroll handling
          setHeaderState('compacted'); // Immediately set the state visually
          window.scrollTo({ top: SCROLL_THRESHOLD_DOWN + 1, behavior: 'smooth' }); // Programmatically scroll
          setTimeout(() => {
            isAdjustingScroll.current = false; // Allow scroll handling again
          }, TRANSITION_DURATION + 150); // Wait for scroll to complete
        }
      }
    } else {
      // scrollDirection === 'up'
      if (!isArtistsPage) {
        if (currentScrollY < SCROLL_THRESHOLD_UP) {
          setHeaderState('initial');
        } else if (currentScrollY >= SCROLL_THRESHOLD_UP && currentScrollY <= SCROLL_THRESHOLD_DOWN) {
          // User is in the dead zone, scrolling up, and header is compacted: snap to initial
          if (headerState === 'compacted') {
            isAdjustingScroll.current = true; // Block further scroll handling
            setHeaderState('initial'); // Immediately set the state visually
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Programmatically scroll to top
            setTimeout(() => {
              isAdjustingScroll.current = false; // Allow scroll handling again
            }, TRANSITION_DURATION + 150); // Wait for scroll to complete
          }
        }
      }
    }
  }, [headerState, isArtistsPage]); // Depend on headerState to get its latest value

  // Optimized scroll handler with requestAnimationFrame
  const optimizedScrollHandler = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    animationFrameId.current = requestAnimationFrame(handleScroll);
  }, [handleScroll]); // Depend on handleScroll

  // Effect for scroll-based header state changes
  useEffect(() => {
    if (isArtistDetail) return; // No scroll listener on artist detail pages

    window.addEventListener('scroll', optimizedScrollHandler);
    if (window.scrollY > 0) {
      handleScroll();
    }

    return () => {
      window.removeEventListener('scroll', optimizedScrollHandler);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isArtistDetail, optimizedScrollHandler, handleScroll]); // Dependencies

  // Artist detail pages show the full header and do not attach scroll listeners

  // Effect to manage body scroll based on showSearchOverlay
  useEffect(() => {
    if (showSearchOverlay) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
  }, [showSearchOverlay]);

  // Effect to attach and detach transitionend listener to the header
  useEffect(() => {
    const headerElement = headerRef.current;
    if (headerElement) {
        // We listen for max-height transition end to trigger scroll adjustment
        const transitionEndHandler = (event: TransitionEvent) => {
            if (event.propertyName === 'max-height') {
                adjustScrollAfterHeaderChange();
            }
        };
        headerElement.addEventListener('transitionend', transitionEndHandler);
        return () => {
            headerElement.removeEventListener('transitionend', transitionEndHandler);
        };
    }
  }, [adjustScrollAfterHeaderChange]);


  const contentWrapperClasses = fullWidthContent
    ? 'w-full'
    : 'w-full px-4 sm:px-6 lg:px-8';


  const showSearchBar =
    !isArtistDetail &&
    (!artistViewActive || user?.user_type !== 'service_provider') &&
    (pathname === '/' || pathname.startsWith('/artists'));

  return (
    <div className="flex min-h-screen flex-col bg-white bg-gradient-to-b from-brand-light/50 to-gray-50">
      {/* Global Overlay for expanded search form */}
      {showSearchOverlay && (
        <div
          id="expanded-search-overlay"
          className="fixed inset-0 bg-black bg-opacity-30 z-40 animate-fadeIn"
          onClick={() => {
            // This click dismisses the overlay and sets header state.
            // MainLayout's handleScroll logic will then re-evaluate the scroll position.
            const targetState = isArtistsPage || window.scrollY > SCROLL_THRESHOLD_DOWN ? 'compacted' : 'initial';
            const scrollTarget = !isArtistsPage && window.scrollY === 0 ? 0 : undefined;
            forceHeaderState(targetState, scrollTarget);
          }}
        />
      )}

      <div className="flex-grow">
        <Header
          ref={headerRef} // Pass ref to Header
          headerState={headerState}
          onForceHeaderState={forceHeaderState}
          extraBar={
            isArtistsRoot ? <div className="mx-auto w-full px-4">{headerAddon}</div> : undefined
          }
          showSearchBar={showSearchBar}
          filterControl={headerFilter}
        />

        {/* CONTENT */}
        <main
          className={clsx('py-1', {
            // Adjust padding if content jumps due to header height changes.
            // With max-height transitions, it should typically flow well.
          })}
          style={{ paddingBottom: 'var(--mobile-bottom-nav-height, 0px)' }}
        >
          <div className={contentWrapperClasses}>{children}</div>
        </main>
      </div>

      {!hideFooter && <Footer />}

      {user && <MobileBottomNav user={user} />}
    </div>
  );
}