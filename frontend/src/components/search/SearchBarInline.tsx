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
  onExpandedChange?: (expanded: boolean) => void;
  isOpen?: boolean;
}

export default function SearchBarInline({
  initialCategory,
  initialLocation,
  initialWhen,
  onSearch,
  onExpandedChange,
  isOpen,
}: Props) {
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

  useClickOutside(wrapperRef, collapse);

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

  const handleSearch = useCallback(
    (params: { category?: string; location?: string; when?: Date | null }) => {
      onSearch(params);
      collapse();
    },
    [onSearch, collapse]
  );

  const isExpanded = expanded || isOpen;

  return (
    <div
      ref={wrapperRef}
      className={clsx(
        'relative w-full mx-auto transition-all duration-300 ease-out',
        isExpanded ? 'max-w-4xl pb-2' : 'max-w-2xl'
      )}
    >
      {isExpanded ? (
        <SearchBar
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
          onSearch={handleSearch}
          onCancel={collapse}
          compact={true} // This ensures it matches homepage layout
        />
      ) : (
        <button
          type="button"
          onClick={expand}
          className="flex items-center bg-white px-4 py-2 shadow-md rounded-full w-full transition-all duration-300 ease-out"
        >
          <div className="px-4 py-1 text-sm text-gray-700 flex-grow">
            {category ? category.label : 'Choose category'}
          </div>
          <div className="px-4 py-1 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis flex-grow">
            {location || 'Anywhere'}
          </div>
          <div className="px-4 py-1 text-sm text-gray-700 flex-grow">
            {when ? format(when, 'd\u00A0MMM\u00A0yyyy') : 'Add\u00A0date'}
          </div>
          <div className="p-1 bg-[var(--color-accent)] text-white rounded-full">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
        </button>
      )}
    </div>
  );
}
