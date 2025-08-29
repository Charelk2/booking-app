// src/hooks/useServiceCategories.ts
import { useEffect, useState } from 'react';
import { getServiceCategories } from '@/lib/api';
import { categorySlug, UI_CATEGORY_TO_ID } from '@/lib/categoryMap';

export interface Category {
  id: number;
  value: string; // slug used in URLs and queries
  label: string; // human-readable name
}

// Build a stable fallback list at module load so first paint is never empty
const FALLBACK_CATEGORIES: Category[] = Object.entries(UI_CATEGORY_TO_ID).map(([slug, id]) => ({
  id,
  value: slug,
  label: slug.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
}));

let cachedCategories: Category[] | null = FALLBACK_CATEGORIES;

export default function useServiceCategories(): Category[] {
  // Show a deterministic fallback immediately on first paint; swap to API data when ready.
  const [categories, setCategories] = useState<Category[]>(cachedCategories || FALLBACK_CATEGORIES);

  useEffect(() => {
    if (cachedCategories && cachedCategories.length) return; // already have data
    getServiceCategories()
      .then((res) => {
        const data = res.data
          .filter((c) => c.name.toLowerCase() !== 'service providers')
          .map((c) => ({
            id: c.id,
            value: categorySlug(c.name),
            label: c.name,
          }));
        cachedCategories = data.length ? data : FALLBACK_CATEGORIES;
        setCategories(cachedCategories);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch service categories', err);
        cachedCategories = FALLBACK_CATEGORIES;
        setCategories(FALLBACK_CATEGORIES);
      });
  }, []);

  return categories;
}
