'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { UI_CATEGORIES, UI_CATEGORY_TO_SERVICE } from '@/lib/categoryMap';

/**
 * Displays a horizontally scrollable list of service categories.
 * Each item shows a square image placeholder and a label below.
 * Clicking an item navigates to the artists listing with the
 * category pre-selected.
 */
export default function CategoriesCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, []);

  const scrollBy = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (

    <section className="mt-4" aria-labelledby="categories-heading">
      <h2 id="categories-heading" className="px-4 text-xl font-semibold">
        Services Near You
      </h2>
      <div className="relative mt-2">
        <button
          type="button"
          aria-label="Previous"
          className="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-white p-2 shadow disabled:opacity-50 sm:block"
          disabled={!canScrollLeft}
          onClick={() => scrollBy(-200)}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div
          ref={scrollRef}
          data-testid="categories-scroll"
          className="flex overflow-x-auto scroll-smooth gap-4 px-4 pb-2"
        >
          {UI_CATEGORIES.map((cat) => (
            <Link
              key={cat.value}
              href={`/artists?category=${encodeURIComponent(
                UI_CATEGORY_TO_SERVICE[cat.value] || cat.value,
              )}`}
              className="flex-shrink-0 text-center"
            >
              <div className="relative h-40 w-40 overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={cat.image || '/default-avatar.svg'}
                  alt={cat.label}
                  fill
                  sizes="160px"
                  className="object-cover"
                />
              </div>
              <p className="mt-1 text-sm">{cat.label}</p>
            </Link>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next"
          className="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border bg-white p-2 shadow disabled:opacity-50 sm:block"
          disabled={!canScrollRight}
          onClick={() => scrollBy(200)}
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </section>
  );
}
