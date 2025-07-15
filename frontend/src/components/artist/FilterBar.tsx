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
    <div className="flex flex-wrap items-center gap-2 bg-white p-4 rounded-2xl shadow-sm">
      <div className="flex flex-wrap gap-2 overflow-x-auto whitespace-nowrap">
        {categories.map((c) => (
          <PillButton
            key={c}
            label={c}
            selected={c === selectedCategory}
            onClick={() => handleCategory(c)}
          />
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
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
        <label className="flex items-center gap-1 text-gray-700">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-300"
          />
          Verified Only
        </label>
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
    </div>
  );
}
