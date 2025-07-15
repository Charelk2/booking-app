'use client';
import type { ChangeEventHandler } from 'react';
import { useState } from 'react';
import { PillButton } from '@/components/ui';

export interface FilterBarProps {
  categories: string[];
  onCategory?: (c: string) => void;
  location: string;
  onLocation: ChangeEventHandler<HTMLInputElement>;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  onClear?: () => void;
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
  filtersActive,
}: FilterBarProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const handleCategory = (c: string) => {
    setSelectedCategory(c);
    onCategory?.(c);
  };

  const clearAll = () => {
    setSelectedCategory(undefined);
    setVerifiedOnly(false);
    onClear?.();
  };

  return (
    <div className="mt-6 mb-4 flex flex-wrap gap-2 bg-white p-3 rounded-xl shadow-sm items-center">
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
        {categories.map((c) => (
          <PillButton
            key={c}
            label={c}
            selected={c === selectedCategory}
            onClick={() => handleCategory(c)}
          />
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <input
          placeholder="Location"
          value={location}
          onChange={onLocation}
          className="text-sm px-3 py-1.5 rounded-md border border-border bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-200 w-[140px]"
        />
        <select
          value={sort}
          onChange={onSort}
          className="text-sm px-3 py-1.5 rounded-md border border-border bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-primary transition-colors duration-200"
        >
          <option value="">Sort</option>
          <option value="top_rated">Top Rated</option>
          <option value="most_booked">Most Booked</option>
          <option value="newest">Newest</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
          />
          Verified Only
        </label>
      </div>
      {filtersActive && onClear && (
        <button
          type="button"
          onClick={clearAll}
          className="text-sm text-primary hover:underline transition-colors duration-200"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
