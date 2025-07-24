'use client';
import { useState, useEffect, KeyboardEvent } from 'react';
import { Popover } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { SearchFields, Category } from './SearchFields';
import { UI_CATEGORIES } from '@/lib/categoryMap';

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

  useEffect(() => {
    if (initialCategory) {
      const found = UI_CATEGORIES.find((c) => c.value === initialCategory);
      if (found) setCategory(found);
    } else {
      setCategory(UI_CATEGORIES[0]);
    }
    setLocation(initialLocation || '');
    setWhen(initialWhen || null);
  }, [initialCategory, initialLocation, initialWhen]);

  const applyAndClose = () => {
    onSearch({ category: category.value, location: location || undefined, when });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, close: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyAndClose();
      close();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <Popover.Button
            className="flex items-center bg-white border border-gray-200 rounded-full shadow-lg divide-x divide-gray-200 overflow-hidden"
          >
            <div className="flex-1 px-4 py-2 text-sm text-gray-700">
              {category.label}
            </div>
            <div className="flex-1 px-4 py-2 text-sm text-gray-700">
              {location || 'Anywhere'}
            </div>
            <div className="flex-1 px-4 py-2 text-sm text-gray-700">
              {when ? format(when, 'd MMM yyyy') : 'Add date'}
            </div>
            <div className="p-2 bg-pink-600 hover:bg-pink-700 text-white">
              <MagnifyingGlassIcon className="h-5 w-5" />
            </div>
          </Popover.Button>
          <Popover.Panel
            className="absolute z-10 top-full left-0 right-0 mt-2 px-4 sm:px-6 lg:px-8"
            onKeyDown={(e) => handleKeyDown(e, close)}
          >
            <div className="bg-white rounded-lg shadow-xl p-4">
              <SearchFields
                category={category}
                setCategory={setCategory}
                location={location}
                setLocation={setLocation}
                when={when}
                setWhen={setWhen}
              />
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  className="bg-pink-600 hover:bg-pink-700 text-white font-medium px-5 py-2 rounded-full"
                  onClick={() => {
                    applyAndClose();
                    close();
                  }}
                >
                  Search
                </button>
              </div>
            </div>
          </Popover.Panel>
        </>
      )}
    </Popover>
  );
}
