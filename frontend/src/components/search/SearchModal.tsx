'use client';
import { useState, useEffect, useRef } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { SearchFields, type Category } from './SearchFields';
import { UI_CATEGORIES } from '@/lib/categoryMap';

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
  const [category, setCategory] = useState<Category | null>(
    initialCategory ? UI_CATEGORIES.find((c) => c.value === initialCategory) ?? null : null,
  );
  const [location, setLocation] = useState(initialLocation || '');
  const [when, setWhen] = useState<Date | null>(initialWhen || null);
  const firstRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setCategory(
        initialCategory ? UI_CATEGORIES.find((c) => c.value === initialCategory) ?? null : null,
      );
      setLocation(initialLocation || '');
      setWhen(initialWhen || null);
    }
  }, [open, initialCategory, initialLocation, initialWhen]);

  const handleClear = () => {
    setCategory(null);
    setLocation('');
    setWhen(null);
  };

  const handleSearch = () => {
    onSearch({
      category: category?.value,
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
