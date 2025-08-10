// src/lib/categoryMap.ts

// Define the shape of a UI category item including the canonical backend ID.
// Explicit IDs remove the previous dependency on array ordering so lookups
// remain stable even if categories are re-arranged or new ones are inserted.
export const UI_CATEGORIES = [
  { id: 1, value: 'musician', label: 'Musicians', image: '/categories/musician.png' },
  { id: 2, value: 'dj', label: 'DJs', image: '/categories/dj.png' },
  { id: 3, value: 'photographer', label: 'Photographers', image: '/categories/photographer.png' },
  { id: 4, value: 'videographer', label: 'Videographers', image: '/categories/videographer.png' },
  { id: 5, value: 'speaker', label: 'Speakers', image: '/categories/speaker.png' },
  { id: 6, value: 'event_service', label: 'Event Services', image: '/categories/event_service.png' },
  { id: 7, value: 'wedding_venue', label: 'Wedding Venues', image: '/categories/wedding_venue.png' },
  { id: 8, value: 'caterer', label: 'Caterers', image: '/categories/caterer.png' },
  { id: 9, value: 'bartender', label: 'Bartenders', image: '/categories/bartender.png' },
  { id: 10, value: 'mc_host', label: 'MCs & Hosts', image: '/categories/mc_host.png' },
] as const; // `as const` ensures TypeScript infers literal types, which is good practice

// Map UI category slugs to their canonical numeric IDs.
export const UI_CATEGORY_TO_ID: Record<string, number> = Object.fromEntries(
  UI_CATEGORIES.map((c) => [c.value, c.id]),
);

// Map UI categories (keys are UI values) to backend service categories (values are backend values)
export const UI_CATEGORY_TO_SERVICE: Record<string, string> = {
  musician: 'Musician',
  dj: 'DJ',
  photographer: 'Photographer',
  videographer: 'Videographer',
  speaker: 'Speaker',
  event_service: 'Event Service',
  wedding_venue: 'Wedding Venue',
  caterer: 'Caterer',
  bartender: 'Bartender',
  mc_host: 'MC & Host',
};

// Create a reverse map from backend service categories to UI categories (for display purposes)
export const SERVICE_TO_UI_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(UI_CATEGORY_TO_SERVICE).map(([ui, service]) => [service, ui]),
);

// You can optionally export a type for clarity across components
export type Category = typeof UI_CATEGORIES[number]; // Infers union of all UI category items
