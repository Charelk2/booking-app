'use client';
import { useState, useEffect, useRef } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { SearchFields } from './SearchBar';
import {
  UI_CATEGORIES,
  UI_CATEGORY_TO_SERVICE,
} from '@/lib/categoryMap';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: string;
  initialLocation?: string;
  initialWhen?: Date | null;
  onSearch: (params: {
    category?: string;
    location?: string;
    when?: Date | null;
  }) => void;
}

export default function SearchModal({
  open,
  onClose,
  initialCategory,
  initialLocation,
  initialWhen,
  onSearch,
}: SearchModalProps) {
  const [category, setCategory] = useState(
    UI_CATEGORIES.find((c) => c.value === initialCategory) || UI_CATEGORIES[0],
  );
  const [location, setLocation] = useState(initialLocation || '');
  const [when, setWhen] = useState<Date | null>(initialWhen || null);
  const firstRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCategory(
        UI_CATEGORIES.find((c) => c.value === initialCategory) ||
          UI_CATEGORIES[0],
      );
      setLocation(initialLocation || '');
      setWhen(initialWhen || null);
    }
  }, [open, initialCategory, initialLocation, initialWhen]);

  const handleClear = () => {
    setCategory(UI_CATEGORIES[0]);
    setLocation('');
    setWhen(null);
  };

  const handleSearch = () => {
    const serviceCat = UI_CATEGORY_TO_SERVICE[category.value] || category.value;
    onSearch({
      category: serviceCat,
      location: location || undefined,
      when,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-4">
        <div ref={firstRef} />
        <SearchFields
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
        />
        <div className="flex justify-between pt-4">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear all
          </button>
          <Button type="button" onClick={handleSearch}>
            Search
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
