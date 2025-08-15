'use client';
 

 import Image from 'next/image';
 import Link from 'next/link';
 import { useEffect, useRef, useState } from 'react';
 import { ChevronRightIcon } from '@heroicons/react/24/solid';
 import useServiceCategories from '@/hooks/useServiceCategories';
 import { CATEGORY_IMAGES } from '@/lib/categoryMap';
 

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
  el.addEventListener('scroll', updateScrollButtons, { passive: true });
  window.addEventListener('resize', updateScrollButtons);
  return () => {
  el.removeEventListener('scroll', updateScrollButtons);
  window.removeEventListener('resize', updateScrollButtons);
  };
  }, []);
 

  const scrollBy = (offset: number) => {
  scrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' });
  };


  const categories = useServiceCategories();

  const DISPLAY_LABELS: Record<string, string> = {
    photographer: 'Photography',
    caterer: 'Catering',
    dj: "DJ's",
    videographer: 'Videographers',
    speaker: 'Speakers',
    sound_service: 'Sound Services',
    wedding_venue: 'Wedding Venues',
    bartender: 'Bartending',
    mc_host: 'MC & Hosts',
  };

  return (
  <section
  className="full-width mx-auto mt-4 px-4 sm:px-6 lg:px-8"
  aria-labelledby="categories-heading"
  >
  <h2 id="categories-heading" className="text-xl font-semibold">
  Services Near You
  </h2>
  <div className="relative mt-2">
  <div
  ref={scrollRef}
  data-testid="categories-scroll"
  className="flex gap-2 overflow-x-auto scroll-smooth pb-2 scrollbar-hide"
  >
  {categories.map((cat) => (
  <Link
  key={cat.value}
  href={`/category/${encodeURIComponent(cat.value)}`}
  className="flex-shrink-0 flex flex-col hover:no-underline"
  >
  <div className="relative h-36 w-36 overflow-hidden rounded-lg bg-gray-100">
  <Image
  src={CATEGORY_IMAGES[cat.value] || '/bartender.png'}
  alt={DISPLAY_LABELS[cat.value] || cat.label}
  fill
  sizes="160px"
  className="object-cover"
  />
  </div>
  <p className="mt-2 text-sm text-left text-black font-semibold whitespace-nowrap">
  {DISPLAY_LABELS[cat.value] || cat.label}
  </p>
  </Link>
  ))}
  </div>
  <button
  type="button"
  aria-label="Next"
  className="absolute right-0 top-1 z-10 hidden -translate-y-1 rounded-full border bg-white p-2 opacity-50 shadow disabled:opacity-50 sm:block"
  disabled={!canScrollRight}
  onClick={() => scrollBy(200)}
  >
  <ChevronRightIcon className="h-2 w-2" />
  </button>
  </div>
  </section>
  );
 }