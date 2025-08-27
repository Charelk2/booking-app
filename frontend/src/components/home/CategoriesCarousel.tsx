'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import useServiceCategories from '@/hooks/useServiceCategories';
import { CATEGORY_IMAGES } from '@/lib/categoryMap';

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
  const items = useMemo(
    () => categories.map(c => ({ ...c, display: DISPLAY_LABELS[c.value] || c.label })),
    [categories]
  );

  // Idle prefetch top categories on homepage
  useEffect(() => {
    if (!items.length) return;
    const idle = (cb: () => void) => (
      'requestIdleCallback' in window
        ? (window as any).requestIdleCallback(cb)
        : setTimeout(cb, 300)
    );
    idle(() => {
      items.slice(0, 4).forEach((cat) => {
        const path = `/category/${encodeURIComponent(cat.value)}`;
        router.prefetch?.(path);
      });
    });
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
    <section className="full-width mx-auto mt-4 px-4 sm:px-6 lg:px-8" aria-labelledby="categories-heading">
      <div className="flex items-center justify-between">
        <h2 id="categories-heading" className="text-xl font-semibold">Services Near You</h2>
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
          {items.map(cat => (
            <Link
              key={cat.value}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 flex flex-col hover:no-underline snap-start"
              aria-label={cat.display}
              onMouseEnter={() => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)}
              onFocus={() => router.prefetch?.(`/category/${encodeURIComponent(cat.value)}`)}
            >
              <div className="relative h-36 w-36 overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={CATEGORY_IMAGES[cat.value] || '/bartender.png'}
                  alt={cat.display}
                  fill
                  sizes="160px"
                  className="object-cover"
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
