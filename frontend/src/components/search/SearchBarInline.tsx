'use client';
import { useState, useRef, useEffect } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
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
  const initialCat = initialCategory
    ? UI_CATEGORIES.find((c) => c.value === initialCategory) || UI_CATEGORIES[0]
    : UI_CATEGORIES[0];
  const [category, setCategory] = useState<Category>(initialCat);
  const [location, setLocation] = useState(initialLocation || '');
  const [when, setWhen] = useState<Date | null>(initialWhen || null);
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapperRef, () => setExpanded(false));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSearch = (params: { category?: string; location?: string; when?: Date | null }) => {
    onSearch(params);
    setExpanded(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full md:max-w-2xl mx-auto px-4">
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
          className="flex items-center bg-white border border-gray-200 rounded-full shadow-sm divide-x divide-gray-200 overflow-hidden w-full"
          onClick={() => setExpanded(true)}
        >
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">{category.label}</div>
          <div className="flex-1 px-4 py-2 text-sm text-gray-700">{location || 'Anywhere'}</div>
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
