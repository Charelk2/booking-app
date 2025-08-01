'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { format } from 'date-fns';
import SearchBar from './SearchBar';
import { type Category } from './SearchFields';
import { UI_CATEGORIES } from '@/lib/categoryMap';
import useClickOutside from '@/hooks/useClickOutside';

interface Props {
  initialCategory?: string;
  initialLocation?: string;
  initialWhen?: Date | null;
  onSearch: (p: { category?: string; location?: string; when?: Date | null }) => void;
  /**
   * Fired whenever the bar expands or collapses.
   * Use to hide surrounding UI like filter buttons.
   */
  onExpandedChange?: (expanded: boolean) => void;
}

export default function SearchBarInline({
  initialCategory,
  initialLocation,
  initialWhen,
  onSearch,
  onExpandedChange,
}: Props) {
  // pick a default category object or null for placeholder
  const initialCat = initialCategory
    ? UI_CATEGORIES.find((c) => c.value === initialCategory) ?? null
    : null;

  const [category, setCategory] = useState<Category | null>(initialCat);
  const [location, setLocation] = useState(initialLocation ?? '');
  const [when, setWhen] = useState<Date | null>(initialWhen ?? null);
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const collapse = useCallback(() => {
    setExpanded(false);
    onExpandedChange?.(false);
  }, [onExpandedChange]);

  const expand = () => {
    setExpanded(true);
    onExpandedChange?.(true);
  };

  // close when clicking outside
  useClickOutside(wrapperRef, collapse);

  // close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        collapse();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [collapse]);

  // run search and collapse
  const handleSearch = (params: { category?: string; location?: string; when?: Date | null }) => {
    onSearch(params);
    collapse();
  };

  return (
    <div
      ref={wrapperRef}
      className={clsx(
        'relative w-full mx-auto px-4 transition-all duration-300 ease-out',
        expanded ? 'max-w-4xl pb-2' : 'max-w-2xl'
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
        />
      ) : (
        <button
          type="button"
          onClick={expand}
          className="flex items-center bg-white border border-gray-200 rounded-full shadow-sm divide-x divide-gray-200 overflow-hidden w-full transition-all duration-300 ease-out"
        >
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">
            {category ? category.label : 'Choose category'}
          </div>
          <div className="flex-1 px-4 py-2 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis">
            {location || 'Anywhere'}
          </div>
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">
            {when ? format(when, 'd\u00A0MMM\u00A0yyyy') : 'Add\u00A0date'}
          </div>
          <div className="p-2 bg-[var(--color-accent)] text-white rounded-r-full">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
        </button>
      )}
    </div>
  );
}
