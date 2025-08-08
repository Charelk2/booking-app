'use client';

import Image from 'next/image';
import Link from 'next/link';
import { UI_CATEGORIES, UI_CATEGORY_TO_SERVICE } from '@/lib/categoryMap';

/**
 * Displays a horizontally scrollable list of service categories.
 * Each item shows a square image placeholder and a label below.
 * Clicking an item navigates to the artists listing with the
 * category pre-selected.
 */
export default function CategoriesCarousel() {
  return (
    <section className="mt-4">
      <h2 className="text-xl font-semibold px-4">Services Near You</h2>
      <div className="mt-2 flex overflow-x-auto gap-4 px-4 pb-2">
        {UI_CATEGORIES.map((cat) => (
          <Link
            key={cat.value}
            href={`/artists?category=${encodeURIComponent(
              UI_CATEGORY_TO_SERVICE[cat.value] || cat.value,
            )}`}
            className="flex-shrink-0 text-center"
          >
            <div className="relative w-40 h-40 rounded-lg overflow-hidden bg-gray-100">
              <Image
                src="/default-avatar.svg"
                alt={cat.label}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
            <p className="mt-1 text-sm">{cat.label}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
