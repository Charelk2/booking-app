// src/components/search/SearchBarInline.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import SearchBar from './SearchBar';
import { UI_CATEGORIES } from '@/lib/categoryMap';
import type { Category } from './SearchFields';

interface SearchBarInlineProps {
  initialCategory?: string;
  initialLocation?: string;
  initialWhen?: Date | null;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
  onExpandedChange?: (expanded: boolean) => void;
}

export default function SearchBarInline({
  initialCategory,
  initialLocation = '',
  initialWhen = null,
  onSearch,
  onExpandedChange,
}: SearchBarInlineProps) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<Category | null>(
    initialCategory ? UI_CATEGORIES.find((c) => c.value === initialCategory) || null : null,
  );
  const [location, setLocation] = useState(initialLocation);
  const [when, setWhen] = useState<Date | null>(initialWhen);

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleExpand = () => {
    setExpanded(true);
    onExpandedChange?.(true);
  };

  const collapse = useCallback(() => {
    setExpanded(false);
    onExpandedChange?.(false);
  }, [onExpandedChange]);

  const handleSearch = useCallback(
    async (params: { category?: string; location?: string; when?: Date | null }) => {
      await onSearch(params);
      collapse();
    },
    [onSearch, collapse],
  );

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        collapse();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, collapse]);

  return (
    <div
      className={clsx(
        'mx-auto transition-all duration-300 ease-out',
        expanded ? 'max-w-4xl' : 'max-w-2xl',
      )}
    >
      {expanded ? (
        <SearchBar
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
          onSearch={handleSearch}
          onCancel={collapse}
          compact={false}
        />
      ) : (
        <button
          type="button"
          onClick={handleExpand}
          className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-full shadow-sm hover:shadow-md text-sm"
        >
          <div className="flex flex-1 divide-x divide-gray-300">
            <div className="flex-1 px-2 truncate text-xs">
              {category ? category.label : 'Add artist'}
            </div>
            <div className="flex-1 px-2 whitespace-nowrap overflow-hidden text-ellipsis text-xs">
              {location || 'Add location'}
            </div>
            <div className="flex-1 px-2 truncate text-xs">
              {when ? dateFormatter.format(when) : 'Add dates'}
            </div>
          </div>
          <MagnifyingGlassIcon className="ml-2 h-5 w-5 text-gray-500 flex-shrink-0" />
        </button>
      )}
    </div>
  );
}
