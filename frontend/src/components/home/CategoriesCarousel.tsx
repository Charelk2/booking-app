'use client';

// Use plain <img> for static category icons to avoid /_next/image revalidation costs
import { BLUR_PLACEHOLDER } from '@/lib/blurPlaceholder';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import useServiceCategories from '@/hooks/useServiceCategories';
import { prefetchServiceProviders } from '@/lib/api';
import { CATEGORY_IMAGES, UI_CATEGORY_TO_ID } from '@/lib/categoryMap';

const CARD_W = 144; // h/w-36 = 9rem = 144px
const GAP = 12;     // gap-3 = 12px

const DISPLAY_LABELS: Record<string, string> = {
  photographer: 'Photography',
  caterer: 'Catering',
  dj: "DJ's",
  musician: 'Musicians',
  videographer: 'Videographers',
  speaker: 'Speakers',
  sound_service: 'Sound Services',
  wedding_venue: 'Wedding Venues',
  bartender: 'Bartending',
  mc_host: 'MC & Hosts',
};

export default function CategoriesCarousel() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const categories = useServiceCategories();
  const fallbackItems = useMemo(() => {
    return Object.entries(UI_CATEGORY_TO_ID).map(([slug, id]) => ({
      id,
      value: slug,
      label: slug.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
      display: DISPLAY_LABELS[slug] || slug,
    }));
  }, []);
  const items = useMemo(
    () => {
      const mapped = categories.map(c => ({ ...c, display: DISPLAY_LABELS[c.value] || c.label }));
      return mapped.length ? mapped : fallbackItems;
    },
    [categories, fallbackItems]
  );

  // Idle prefetch top categories on homepage
  useEffect(() => {
    if (!items.length) return;
    const didPrefetch = { value: false } as { value: boolean };
    const isSafari = typeof navigator !== 'undefined' && /safari/i.test(navigator.userAgent) && !/chrome|crios|android/i.test(navigator.userAgent);
    const sessionKey = 'home:prefetch-done';

    const runPrefetch = () => {
      if (didPrefetch.value) return;
      didPrefetch.value = true;
      try {
        // Defer two frames to ensure first paint, then a tiny timeout
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Give the page a moment to settle, then gently stagger requests
            setTimeout(() => {
              items.slice(0, 4).forEach((cat, index) => {
                const path = `/category/${encodeURIComponent(cat.value)}`;
                router.prefetch?.(path);
                // Avoid list prefetch on homepage to reduce API load spikes.
                // Keep only route prefetch; the list page will fetch on demand.
                // (Intentionally no API prefetch here.)
                setTimeout(() => {}, index * 200);
              });
            }, 1000);
          });
        });
      } catch {}
    };

    // On Safari, be extra conservative: only prefetch once per session and only after 'load',
    // even if readyState is already 'complete'. This avoids first-paint hangs.
    if (isSafari && typeof document !== 'undefined') {
      try { if (sessionStorage.getItem(sessionKey)) return; } catch {}
      const afterLoad = () => {
        window.removeEventListener('load', afterLoad);
        document.removeEventListener('visibilitychange', onVis);
        setTimeout(() => {
          try { sessionStorage.setItem(sessionKey, '1'); } catch {}
          runPrefetch();
        }, 1000); // ensure paint happened well before prefetch
      };
      const onVis = () => {
        if (document.visibilityState === 'visible') {
          window.removeEventListener('load', afterLoad);
          document.removeEventListener('visibilitychange', onVis);
          setTimeout(() => {
            try { sessionStorage.setItem(sessionKey, '1'); } catch {}
            runPrefetch();
          }, 1000);
        }
      };
      // If load already fired, still delay; else wait for it
      if (document.readyState === 'complete') {
        setTimeout(() => {
          try { sessionStorage.setItem(sessionKey, '1'); } catch {}
          runPrefetch();
        }, 1000);
      } else {
        window.addEventListener('load', afterLoad, { once: true });
        document.addEventListener('visibilitychange', onVis, { once: true });
      }
      return () => {
        window.removeEventListener('load', afterLoad);
        document.removeEventListener('visibilitychange', onVis);
      };
    }

    // Other browsers: prefetch gently after idle
    const idle = (cb: () => void) => (
      'requestIdleCallback' in window
        ? (window as any).requestIdleCallback(cb)
        : setTimeout(cb, 300)
    );
    const handle = idle(runPrefetch as any);
    return () => {
      if ('cancelIdleCallback' in window) (window as any).cancelIdleCallback?.(handle);
      else clearTimeout(handle);
    };
  }, [items, router]);

  const updateButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // allow tiny tolerance for sub-pixel rounding
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const onScrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    // scroll ~3 cards at a time
    el.scrollBy({ left: dir * (CARD_W * 3 + GAP * 3), behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateButtons();

    const onScroll = () => updateButtons();
    const onResize = () => updateButtons();

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    // Watch size changes (fonts/images)
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(onResize);
      ro.observe(el);
    } catch {
      /* older browsers can live with window resize only */
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [updateButtons]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onScrollBy(1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onScrollBy(-1); }
  };

  return (
    <section
      className="full-width mx-auto w-full max-w-7xl mt-4 px-4 sm:px-6 lg:px-8"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="categories-heading" className="text-xl font-semibold">Services</h2>
        <div className="hidden sm:flex gap-2">
          <button
            type="button"
            aria-label="Previous"
            className="rounded-full border bg-white p-2 shadow transition disabled:opacity-40"
            disabled={!canScrollLeft}
            onClick={() => onScrollBy(-1)}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            className="rounded-full border bg-white p-2 shadow transition disabled:opacity-40"
            disabled={!canScrollRight}
            onClick={() => onScrollBy(1)}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative mt-3" role="region" aria-roledescription="carousel" aria-label="Service categories">
        {/* edge fades (hidden until scrolling actually possible in that direction) */}
        {canScrollLeft && (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 md:w-6
               bg-gradient-to-r from-white/30 to-transparent
               hidden sm:block transition-opacity"
  />
)}
{canScrollRight && (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 md:w-6
               bg-gradient-to-l from-white/30 to-transparent
               hidden sm:block transition-opacity"
  />
)}


        <div
          ref={scrollRef}
          data-testid="categories-scroll"
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="flex gap-3 overflow-x-auto pb-2 pr-2 scroll-smooth scrollbar-hide snap-x snap-mandatory"
          aria-label="Scrollable list"
        >
          {items.map((cat, i) => (
            <Link
              key={cat.value}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 flex flex-col hover:no-underline snap-start active:scale-[0.98] transition-transform duration-100"
              aria-label={cat.display}
              onMouseEnter={() => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)}
              onFocus={() => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)}
            >
              <div className="relative h-32 w-32 overflow-hidden rounded-lg bg-gray-100">
                <img
                  src={CATEGORY_IMAGES[cat.value] || '/bartender.png'}
                  alt={cat.display}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  width={144}
                  height={144}
                  style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                />
              </div>
              <p className="mt-2 text-xs text-left text-black font-semibold whitespace-nowrap">
                {cat.display}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
