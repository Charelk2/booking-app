'use client';

// Use plain <img> for static category icons to avoid /_next/image revalidation costs
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useServiceCategories from '@/hooks/useServiceCategories';
import { CATEGORY_IMAGES, UI_CATEGORY_TO_ID } from '@/lib/categoryMap';

const CARD_W = 128; // w-32 = 8rem = 128px
const GAP = 12; // gap-3 = 12px
const INFINITE_REPEATS = 3;
const INFINITE_MIDDLE_INDEX = Math.floor(INFINITE_REPEATS / 2);

const DISPLAY_LABELS: Record<string, string> = {
  photographer: 'Photography',
  caterer: 'Catering',
  dj: "DJ's",
  musician: 'Musicians',
  videographer: 'Videographers',
  speaker: 'Speakers',
  sound_service: 'Sound Services',
  venue: 'Venues',
  // Legacy alias (older URLs / cached payloads)
  wedding_venue: 'Venues',
  bartender: 'Bartending',
  mc_host: 'MC & Hosts',
};

export default function CategoriesCarousel() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const strideRef = useRef<number>(0);
  const isAdjustingRef = useRef(false);
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

  // Preload category images so wrap-around doesn't briefly show empty tiles
  // when the scroll position jumps between duplicated copies.
  useEffect(() => {
    if (!items.length) return;
    try {
      const srcs = Array.from(
        new Set(items.map((cat) => CATEGORY_IMAGES[cat.value] || '/bartender.png')),
      );
      srcs.forEach((src) => {
        const img = new Image();
        img.src = src;
        // Best-effort decode (not supported everywhere)
        (img as any).decode?.().catch(() => {});
      });
    } catch {}
  }, [items]);

  const renderItems = useMemo(() => {
    if (!items.length) return [] as Array<{ cat: typeof items[number]; repeatIndex: number }>;
    return Array.from({ length: INFINITE_REPEATS }, (_, repeatIndex) =>
      items.map((cat) => ({ cat, repeatIndex }))
    ).flat();
  }, [items]);

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

  const setScrollLeftInstant = useCallback((left: number) => {
    const el = scrollRef.current;
    if (!el) return;
    isAdjustingRef.current = true;
    const prev = el.style.scrollBehavior;
    const prevSnap = el.style.scrollSnapType;
    el.style.scrollBehavior = 'auto';
    el.style.scrollSnapType = 'none';
    el.scrollLeft = left;
    requestAnimationFrame(() => {
      el.style.scrollBehavior = prev;
      el.style.scrollSnapType = prevSnap;
      requestAnimationFrame(() => {
        isAdjustingRef.current = false;
      });
    });
  }, []);

  const measureStride = useCallback((): number => {
    const el = scrollRef.current;
    const n = items.length;
    if (!el || n <= 0) return 0;
    const children = el.children;
    if (children.length < n + 1) return 0;
    const first = children[0] as HTMLElement | undefined;
    const second = children[n] as HTMLElement | undefined;
    if (!first || !second) return 0;
    const stride = second.offsetLeft - first.offsetLeft;
    if (!Number.isFinite(stride) || stride <= 0) return 0;
    strideRef.current = stride;
    return stride;
  }, [items.length]);

  const normalizeToMiddleCopy = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stride = strideRef.current || measureStride();
    if (!stride) return;
    const middleStart = stride * INFINITE_MIDDLE_INDEX;
    const relative = ((el.scrollLeft % stride) + stride) % stride;
    const next = middleStart + relative;
    if (Math.abs(el.scrollLeft - next) <= 1) return;
    setScrollLeftInstant(next);
  }, [measureStride, setScrollLeftInstant]);

  const updateButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth > el.clientWidth + 1;
    setCanScrollLeft(scrollable);
    setCanScrollRight(scrollable);
  }, []);

  const onScrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    // scroll ~3 cards at a time
    el.scrollBy({ left: dir * (CARD_W + GAP) * 3, behavior: 'smooth' });
  };

  // Initialize in the "middle" copy so the carousel can wrap infinitely.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Ensure we have a stride and start in the middle set.
    measureStride();
    normalizeToMiddleCopy();
    updateButtons();
  }, [items.length, measureStride, normalizeToMiddleCopy, updateButtons]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateButtons();

    const onScroll = () => {
      if (!isAdjustingRef.current) {
        const stride = strideRef.current || measureStride();
        if (stride) {
          const middleStart = stride * INFINITE_MIDDLE_INDEX;
          const middleEnd = middleStart + stride;
          let left = el.scrollLeft;

          // Keep the user within the middle copy; when they scroll into the
          // first/last copy, jump by exactly one stride to preserve continuity.
          if (left < middleStart) {
            while (left < middleStart) left += stride;
            if (Math.abs(el.scrollLeft - left) > 1) setScrollLeftInstant(left);
          } else if (left >= middleEnd) {
            while (left >= middleEnd) left -= stride;
            if (Math.abs(el.scrollLeft - left) > 1) setScrollLeftInstant(left);
          }
        }
      }
      updateButtons();
    };
    const onResize = () => {
      measureStride();
      normalizeToMiddleCopy();
      updateButtons();
    };

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
  }, [measureStride, normalizeToMiddleCopy, setScrollLeftInstant, updateButtons]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); onScrollBy(1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onScrollBy(-1); }
  };

  return (
    <section
      className="full-width mx-auto w-full max-w-7xl mt-4 px-4 py-6 sm:px-6 lg:px-8"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="categories-heading" className="text-xl font-semibold">Services</h2>
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
          {renderItems.map(({ cat, repeatIndex }, i) => {
            const isInteractive = repeatIndex === INFINITE_MIDDLE_INDEX;
            const isEager = repeatIndex === INFINITE_MIDDLE_INDEX;

            return (
            <Link
              key={`${repeatIndex}:${cat.value}`}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 flex flex-col hover:no-underline snap-start active:scale-[0.98] transition-transform duration-100"
              aria-label={cat.display}
              aria-hidden={isInteractive ? undefined : true}
              tabIndex={isInteractive ? 0 : -1}
              onMouseEnter={
                isInteractive
                  ? () => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)
                  : undefined
              }
              onFocus={
                isInteractive
                  ? () => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)
                  : undefined
              }
            >
              <div className="relative h-32 w-32 overflow-hidden rounded-lg bg-gray-100">
                <img
                  src={CATEGORY_IMAGES[cat.value] || '/bartender.png'}
                  alt={cat.display}
                  loading={isEager ? 'eager' : 'lazy'}
                  decoding="async"
                  width={128}
                  height={128}
                  style={{
                    objectFit: 'cover',
                    width: '100%',
                    height: '100%',
                  }}
                  className="block"
                />
              </div>
              <p className="mt-2 text-xs text-left text-black font-semibold whitespace-nowrap">
                {cat.display}
              </p>
            </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
