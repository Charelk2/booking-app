'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { SearchFields, Category } from './SearchFields';
import {
  UI_CATEGORIES,
  UI_CATEGORY_TO_SERVICE,
  SERVICE_TO_UI_CATEGORY,
} from '@/lib/categoryMap';

interface SearchBarProps { compact?: boolean; }

export default function SearchBar({ compact = false }: SearchBarProps) {
  const [category, setCategory] = useState<Category>(UI_CATEGORIES[0]);
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) {
      const mapped = SERVICE_TO_UI_CATEGORY[catParam] || catParam;
      const found = UI_CATEGORIES.find((c) => c.value === mapped);
      if (found) setCategory(found);
    }
    const locParam = searchParams.get('location');
    if (locParam) setLocation(locParam);
    const whenParam = searchParams.get('when');
    if (whenParam) {
      const d = new Date(whenParam);
      if (!Number.isNaN(d.getTime())) setWhen(d);
    }
  }, [searchParams]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (category) {
      const mapped = UI_CATEGORY_TO_SERVICE[category.value] || category.value;
      params.set('category', mapped);
    }
    if (location) params.set('location', location);
    if (when) params.set('when', when.toISOString());
    const qs = params.toString();
    router.push(qs ? `/artists?${qs}` : '/artists');
  };

  return (
    // Added a wrapper div for width control and centering
    <div className="max-w-4xl mx-auto my-4"> {/* Adjust max-w-3xl as needed */}
      <div className={clsx('flex items-stretch bg-white rounded-full shadow-lg overflow-visible', compact && 'text-sm')}>
        <SearchFields
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
        />
        <button
          type="button"
          onClick={handleSearch}
          className="bg-pink-600 hover:bg-pink-700 px-5 py-3 flex items-center justify-center text-white rounded-r-full"
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </button>
      </div>
    </div>
  );
}
