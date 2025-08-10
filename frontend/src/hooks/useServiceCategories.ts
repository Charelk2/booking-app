// src/hooks/useServiceCategories.ts
import { useEffect, useState } from 'react';
import { getServiceCategories } from '@/lib/api';
import { categorySlug } from '@/lib/categoryMap';

export interface Category {
  id: number;
  value: string; // slug used in URLs and queries
  label: string; // human-readable name
}

let cachedCategories: Category[] | null = null;

export default function useServiceCategories(): Category[] {
  const [categories, setCategories] = useState<Category[]>(
    cachedCategories || [],
  );

  useEffect(() => {
    if (cachedCategories) return;
    getServiceCategories()
      .then((res) => {
        const data = res.data.map((c) => ({
          id: c.id,
          value: categorySlug(c.name),
          label: c.name,
        }));
        cachedCategories = data;
        setCategories(data);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch service categories', err);
      });
  }, []);

  return categories;
}
