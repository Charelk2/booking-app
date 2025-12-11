// frontend/src/components/home/CategoriesCarouselServer.tsx
// Server-rendered shell of the Categories Carousel for instant first paint.
// Renders a horizontally scrollable row of category cards using the
// deterministic UI mapping so there is no white gap while the client bundle
// hydrates. The client-enhanced version adds prefetching and buttons.

import Link from 'next/link';
import { CATEGORY_IMAGES, UI_CATEGORY_TO_ID } from '@/lib/categoryMap';

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

export default function CategoriesCarouselServer() {
  const items = Object.entries(UI_CATEGORY_TO_ID).map(([slug]) => ({
    value: slug,
    display: DISPLAY_LABELS[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    img: CATEGORY_IMAGES[slug] || '/bartender.png',
  }));

  return (
    <section
      className="full-width mx-auto w-full max-w-7xl pt-4 px-4 sm:px-6 lg:px-8 animate-fadeIn"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-center justify-between">
        <h2 id="categories-heading" className="text-xl font-semibold">Services</h2>
      </div>

      <div className="relative mt-3" role="region" aria-roledescription="carousel" aria-label="Service categories">
        {/* subtle edge gradients as scroll affordance */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white/20 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-white/20 to-transparent" />
        <div
          className="flex gap-3 overflow-x-auto pb-2 pr-2 scroll-smooth scrollbar-hide snap-x snap-mandatory min-h-[180px]"
          aria-label="Scrollable list"
        >
          {items.map((cat, idx) => (
            <Link
              key={cat.value}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 flex flex-col hover:no-underline snap-start"
              aria-label={cat.display}
            >
              <div className="relative h-32 w-32 overflow-hidden rounded-lg bg-gray-100">
                <img
                  src={cat.img}
                  alt={cat.display}
                  loading="eager"
                  fetchPriority={idx < 6 ? "high" : "auto"}
                  decoding="async"
                  width={144}
                  height={144}
                  style={{
                    objectFit: 'cover',
                    width: '100%',
                    height: '100%',
                    transition: 'transform 180ms ease-out',
                  }}
                  className="hover:scale-105"
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
