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
  sound_service: '/categories/sound_service.png',
  wedding_venue: '/categories/wedding_venue.png',
  caterer: '/categories/caterer.png',
  bartender: '/categories/bartender.png',
  mc_host: '/categories/mc_host.png',
};

// Canonical mapping from UI slugs to backend category IDs. These IDs
// mirror the order used when seeding `service_categories` in the
// backend to avoid coupling the frontend to database lookups.
export const UI_CATEGORY_TO_ID: Record<string, number> = {
  musician: 1,
  dj: 2,
  photographer: 3,
  videographer: 4,
  speaker: 5,
  sound_service: 6,
  wedding_venue: 7,
  caterer: 8,
  bartender: 9,
  mc_host: 10,
};

// Inverse lookup from category ID to slug for cases where only the numeric ID
// is available, such as when editing an existing service without a stored slug.
export const ID_TO_UI_CATEGORY: Record<number, string> = Object.fromEntries(
  Object.entries(UI_CATEGORY_TO_ID).map(([slug, id]) => [id, slug]),
);

// Mapping from backend category names to canonical frontend slugs. This
// accounts for punctuation and pluralization so that dynamic categories
// consistently route to the correct homepage sections (e.g., "DJ's" →
// "dj", "Sound Services" → "sound_service").
const NAME_TO_SLUG: Record<string, string> = {
  Musician: 'musician',
  DJ: 'dj',
  "DJ's": 'dj',
  Photographer: 'photographer',
  Videographer: 'videographer',
  Speaker: 'speaker',
  'Sound Service': 'sound_service',
  'Sound Services': 'sound_service',
  'Wedding Venue': 'wedding_venue',
  Caterer: 'caterer',
  Bartender: 'bartender',
  'MC & Host': 'mc_host',
  'MC & Hosts': 'mc_host',
};

// Convert a backend category name to a URL-friendly slug. Known categories
// are looked up via NAME_TO_SLUG; others fall back to a sanitized slug.
export const categorySlug = (name: string): string => {
  const mapped = NAME_TO_SLUG[name];
  if (mapped) return mapped;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
};
