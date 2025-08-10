'use client';
import { useState, useEffect, useRef } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { SearchFields, type Category } from './SearchFields';
import useServiceCategories from '@/hooks/useServiceCategories';

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
  const categories = useServiceCategories();
  const [category, setCategory] = useState<Category | null>(null);
  const [location, setLocation] = useState(initialLocation || '');
  const [when, setWhen] = useState<Date | null>(initialWhen || null);
  const firstRef = useRef<HTMLDivElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  // SearchModal renders fields inline, so we don't track an active field
  const handleFieldClick = () => {};

  useEffect(() => {
    if (open && categories.length) {
      setCategory(
        initialCategory
          ? categories.find((c) => c.value === initialCategory) ?? null
          : null,
      );
      setLocation(initialLocation || '');
      setWhen(initialWhen || null);
    }
  }, [open, initialCategory, initialLocation, initialWhen, categories]);

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
          activeField={null}
          onFieldClick={handleFieldClick}
          locationInputRef={locationInputRef}
          onPredictionsChange={(_predictions) => {}}
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
