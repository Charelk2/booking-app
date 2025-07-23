export const UI_CATEGORIES = [
  { value: 'musician', label: 'Musician / Band' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'dj', label: 'DJ' },
  { value: 'venue', label: 'Venue' },
] as const;

// Map UI categories to backend service categories
export const UI_CATEGORY_TO_SERVICE: Record<string, string> = {
  musician: 'Live Performance',
  photographer: 'Photography',
  dj: 'DJ',
  venue: 'Venue',
};

export const SERVICE_TO_UI_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(UI_CATEGORY_TO_SERVICE).map(([ui, service]) => [service, ui]),
);
