// frontend/src/components/home/CategoriesCarouselServer.tsx
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
      className="full-width mx-auto w-full max-w-7xl mt-8 px-4 sm:px-6 lg:px-8 overflow-hidden"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 id="categories-heading" className="text-2xl font-bold tracking-tight text-black">
            Services
          </h2>
          <p className="hidden sm:block text-sm text-gray-500 mt-1">
            Browse our hand-picked categories
          </p>
        </div>
        {/* Optional: Add a 'View All' link here if needed */}
      </div>

      <div className="relative group" role="region" aria-label="Service categories">
        {/* Gradient Overlays for mobile scroll hints */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white to-transparent opacity-100 sm:w-12" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent opacity-100 sm:w-12" />

        <div
          className="flex gap-4 sm:gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x snap-mandatory touch-pan-x"
          aria-label="Scrollable list"
        >
          {items.map((cat) => (
            <Link
              key={cat.value}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 group/card w-28 sm:w-36 flex flex-col snap-start no-underline outline-none focus-visible:ring-2 focus-visible:ring-black rounded-xl p-1 transition-all"
              aria-label={cat.display}
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-200 shadow-sm ring-1 ring-black/5 transition-transform duration-300 ease-out group-hover/card:scale-105 group-hover/card:shadow-md active:scale-95">
                <img
                  src={cat.img}
                  alt={cat.display}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-110"
                />
                {/* Subtle scrim for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
              </div>
              
              <p className="mt-3 text-[13px] sm:text-sm text-center sm:text-left text-gray-900 font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis px-1 transition-colors group-hover/card:text-blue-600">
                {cat.display}
              </p>
            </Link>
          ))}
          {/* Spacer to ensure the last item aligns correctly on mobile */}
          <div className="flex-shrink-0 w-4 sm:w-0" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}