// src/lib/categoryMap.ts

// Define the shape of a UI category item
export const UI_CATEGORIES = [
  { value: 'musician', label: 'Musician / Band' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'dj', label: 'DJ' },
  { value: 'venue', label: 'Venue' },
] as const; // `as const` ensures TypeScript infers literal types, which is good practice

// Map UI categories (keys are UI values) to backend service categories (values are backend values)
export const UI_CATEGORY_TO_SERVICE: Record<string, string> = {
  musician: 'Live Performance',
  photographer: 'Photography',
  dj: 'DJ',
  venue: 'Venue',
};

// Create a reverse map from backend service categories to UI categories (for display purposes)
export const SERVICE_TO_UI_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(UI_CATEGORY_TO_SERVICE).map(([ui, service]) => [service, ui]),
);

// You can optionally export a type for clarity across components
export type Category = typeof UI_CATEGORIES[number]; // Infers { value: 'musician' | 'photographer' | 'dj' | 'venue', label: 'Musician / Band' | 'Photographer' | 'DJ' | 'Venue' }