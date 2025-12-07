// frontend/src/components/home/CategoriesCarouselServer.tsx

// Server-rendered shell of the Categories Carousel for instant first paint.
// Renders a horizontally scrollable row of category cards using the
// deterministic UI mapping so there is no white gap while the client bundle
// hydrates. The client-enhanced version adds prefetching and buttons.

import Link from 'next/link';
import Image from 'next/image'; 
import { CATEGORY_IMAGES, UI_CATEGORY_TO_ID } from '@/lib/categoryMap';

// Enhanced Display Labels
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
    // Use the provided mapping logic (no regression)
    display: DISPLAY_LABELS[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    img: CATEGORY_IMAGES[slug] || '/bartender.png',
  }));

  // Define skeleton card dimensions for CLS prevention
  const CARD_WIDTH_PX = 130; 
  const CARD_HEIGHT_PX = 130; 
  // Note: Removing fixed height from section class to allow margin to work correctly, 
  // but keeping the variable if you need it for skeleton loaders elsewhere.
  
  return (
    <section
      // Added mb-12 (48px) for mobile and sm:mb-16 (64px) for desktop to create the requested spacing
      className="full-width mx-auto w-full max-w-7xl mt-8 mb-12 sm:mb-16 px-4 sm:px-6 lg:px-8 animate-fadeIn min-h-[168px]"
      aria-labelledby="categories-heading"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="categories-heading" className="text-2xl font-bold tracking-tight text-gray-900">
          Discover Services
        </h2>
        <Link href="/explore" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 hidden sm:block">
          View all →
        </Link>
      </div>

      <div 
        className="relative mt-3" 
        role="region" 
        aria-roledescription="carousel" 
        aria-label="Scrollable list of service categories"
      >
        {/* Subtle Edge Gradients (Improved Contrast) */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white/90 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white/90 to-transparent" />
        
        <div
          className="flex gap-4 overflow-x-auto pb-4 pr-4 scroll-smooth scrollbar-hide snap-x snap-mandatory"
          tabIndex={0} // Allows focus/keyboard navigation on the scroll container
          aria-live="polite" 
        >
          {items.map((cat, index) => (
            <Link
              key={cat.value}
              href={`/category/${encodeURIComponent(cat.value)}`}
              className="flex-shrink-0 flex flex-col hover:no-underline snap-start group"
              // Announce current item position for screen readers
              role="group"
              aria-label={`${cat.display}, ${index + 1} of ${items.length}`}
            >
              <div 
                // Using template literals for dynamic sizing if strictly needed, but standard tailwind classes are safer if dimensions are static
                className={`relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 group-hover:shadow-2xl group-hover:scale-[1.02]`}
                style={{
                  height: CARD_HEIGHT_PX,
                  width: CARD_WIDTH_PX,
                  aspectRatio: '1/1' // Ensures a perfect square on all devices
                }}
              >
                {/* Enhanced Image Tag */}
                <Image
                  src={cat.img}
                  alt={cat.display}
                  priority={true} 
                  sizes="(max-width: 640px) 130px, 150px"
                  fill 
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.08] filter brightness-[.97]"
                />
                
                {/* Subtle Image Overlay */}
                <div className="absolute inset-0 bg-black/10 mix-blend-multiply opacity-0 transition-opacity duration-300 group-hover:opacity-50"></div>
              </div>
              
              <p className="mt-3 text-sm text-left text-gray-800 font-bold whitespace-nowrap transition-colors duration-200 group-hover:text-indigo-600">
                {cat.display}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}