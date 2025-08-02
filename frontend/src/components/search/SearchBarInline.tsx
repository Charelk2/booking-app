// src/components/search/SearchBarInline.tsx
'use client';

import { useState, useCallback } from 'react';
import SearchBar from './SearchBar';
import { UI_CATEGORIES } from '@/lib/categoryMap';
import type { Category } from './SearchFields';

interface SearchBarInlineProps {
  initialCategory?: string;
  initialLocation?: string;
  initialWhen?: Date | null;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
}

export default function SearchBarInline({
  initialCategory,
  initialLocation = '',
  initialWhen = null,
  onSearch,
}: SearchBarInlineProps) {
  const [category, setCategory] = useState<Category | null>(
    initialCategory ? UI_CATEGORIES.find((c) => c.value === initialCategory) || null : null,
  );
  const [location, setLocation] = useState(initialLocation);
  const [when, setWhen] = useState<Date | null>(initialWhen);

  const handleSearch = useCallback(
    async (params: { category?: string; location?: string; when?: Date | null }) => {
      await onSearch(params);
    },
    [onSearch],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <SearchBar
        category={category}
        setCategory={setCategory}
        location={location}
        setLocation={setLocation}
        when={when}
        setWhen={setWhen}
        onSearch={handleSearch}
        compact={false}
      />
    </div>
  );
}
