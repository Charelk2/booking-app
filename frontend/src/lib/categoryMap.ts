// src/lib/categoryMap.ts
// Mapping helpers for service categories. The list of categories themselves is
// fetched from the backend; this file only keeps UI resources that cannot be
// derived from the API.

// Map category slugs to their representative image paths.
export const CATEGORY_IMAGES: Record<string, string> = {
  musician: '/categories/musician.png',
  dj: '/categories/dj.png',
  photographer: '/categories/photographer.png',
  videographer: '/categories/videographer.png',
  speaker: '/categories/speaker.png',
  event_service: '/categories/event_service.png',
  wedding_venue: '/categories/wedding_venue.png',
  caterer: '/categories/caterer.png',
  bartender: '/categories/bartender.png',
  mc_host: '/categories/mc_host.png',
};

// Convert a backend category name to a URL-friendly slug. This mirrors the
// previous hard-coded mapping but works for future categories as well.
export const categorySlug = (name: string): string =>
  name.toLowerCase().replace(/&/g, '').replace(/\s+/g, '_');
