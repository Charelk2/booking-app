'use client';
import type { ChangeEventHandler } from 'react';
import { useState } from 'react';
import { PillButton } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';
import FilterPopover from './FilterPopover';
import FilterSheet from './FilterSheet';

export interface FilterBarProps {
  categories: string[];
  onCategory?: (c: string) => void;
  location: string;
  onLocation: ChangeEventHandler<HTMLInputElement>;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  onClear?: () => void;
  onApply?: () => void;
  filtersActive: boolean;
}

export default function FilterBar({
  categories,
  onCategory,
  location,
  onLocation,
  sort,
  onSort,
  onClear,
  onApply,
  filtersActive,
}: FilterBarProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleApply = () => {
    onApply?.();
    setSheetOpen(false);
  };

  const handleCategory = (c: string) => {
    setSelectedCategory((prev) => (prev === c ? undefined : c));
    onCategory?.(c);
  };

  const clearAll = () => {
    setSelectedCategory(undefined);
    setVerifiedOnly(false);
    onClear?.();
  };

  return (
    <div className="flex items-center gap-2 p-4 bg-white rounded-2xl shadow-sm overflow-x-auto whitespace-nowrap">
      {isMobile ? (
        <>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-center text-sm hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            Filters
          </button>
          <FilterSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={handleCategory}
            verifiedOnly={verifiedOnly}
            onVerifiedOnly={setVerifiedOnly}
            sort={sort}
            onSort={onSort}
            onClear={clearAll}
            onApply={handleApply}
          />
        </>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto">
          {categories.slice(0, 3).map((c) => (
            <PillButton
              key={c}
              label={c}
              selected={c === selectedCategory}
              onClick={() => handleCategory(c)}
            />
          ))}
          <FilterPopover
            categories={categories}
            selectedCategory={selectedCategory}
            onSelect={handleCategory}
            verifiedOnly={verifiedOnly}
            onVerified={setVerifiedOnly}
          />
        </div>
      )}
      <input
        placeholder="Location"
        value={location}
        onChange={onLocation}
        className="h-10 px-3 rounded-lg border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <select
        value={sort}
        onChange={onSort}
        className="h-10 px-3 rounded-lg border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
      >
        <option value="">Sort</option>
        <option value="top_rated">Top Rated</option>
        <option value="most_booked">Most Booked</option>
        <option value="newest">Newest</option>
      </select>
      {filtersActive && (
        <button
          type="button"
          onClick={clearAll}
          className="text-indigo-600 hover:underline text-sm transition-colors duration-200"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
