'use client';

import { useState, useRef, useEffect } from 'react';
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
}

export default function SearchBarInline({
  initialCategory,
  initialLocation,
  initialWhen,
  onSearch,
}: Props) {
  // pick a default category object
  const initialCat = initialCategory
    ? UI_CATEGORIES.find((c) => c.value === initialCategory) ?? UI_CATEGORIES[0]
    : UI_CATEGORIES[0];

  const [category, setCategory] = useState<Category>(initialCat);
  const [location, setLocation] = useState(initialLocation ?? '');
  const [when, setWhen] = useState<Date | null>(initialWhen ?? null);
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // close when clicking outside
  useClickOutside(wrapperRef, () => setExpanded(false));

  // close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // run search and collapse
  const handleSearch = (params: { category?: string; location?: string; when?: Date | null }) => {
    onSearch(params);
    setExpanded(false);
  };

  return (
    <div
      ref={wrapperRef}
      className={clsx(
        'relative w-full mx-auto px-4 transition-all duration-300 ease-out',
        expanded
          ? 'max-w-full md:max-w-5xl lg:max-w-6xl'
          : 'md:max-w-2xl'
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
          onCancel={() => setExpanded(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center bg-white border border-gray-200 rounded-full shadow-sm divide-x divide-gray-200 overflow-hidden w-full hover:ring-2 hover:ring-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all duration-300 ease-out"
        >
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">
            {category.label}
          </div>
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">
            {location || 'Anywhere'}
          </div>
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">
            {when ? format(when, 'd\u00A0MMM\u00A0yyyy') : 'Add\u00A0date'}
          </div>
          <div className="p-2 bg-pink-600 text-white rounded-r-full">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </div>
        </button>
      )}
    </div>
  );
}
