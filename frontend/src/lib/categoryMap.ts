// src/lib/categoryMap.ts

// Define the shape of a UI category item
export const UI_CATEGORIES = [
  { value: 'musician', label: 'Musicians' },
  { value: 'dj', label: 'DJs' },
  { value: 'photographer', label: 'Photographers' },
  { value: 'videographer', label: 'Videographers' },
  { value: 'speaker', label: 'Speakers' },
  { value: 'event_service', label: 'Event Services' },
  { value: 'wedding_venue', label: 'Wedding Venues' },
  { value: 'caterer', label: 'Caterers' },
  { value: 'bartender', label: 'Bartenders' },
  { value: 'mc_host', label: 'MCs & Hosts' },
] as const; // `as const` ensures TypeScript infers literal types, which is good practice

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
