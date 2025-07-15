'use client';
import clsx from 'clsx';
import type { ChangeEventHandler } from 'react';

export interface FilterBarProps {
  categories: string[];
  category?: string;
  onCategory?: (c: string) => void;
  location: string;
  onLocation: ChangeEventHandler<HTMLInputElement>;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  verifiedOnly: boolean;
  onVerifiedOnly: ChangeEventHandler<HTMLInputElement>;
  onClear?: () => void;
  filtersActive: boolean;
}

export default function FilterBar({
  categories,
  category,
  onCategory,
  location,
  onLocation,
  sort,
  onSort,
  verifiedOnly,
  onVerifiedOnly,
  onClear,
  filtersActive,
}: FilterBarProps) {
  return (
    <div className="mt-6 mb-4 px-6 py-4 bg-white rounded-2xl shadow flex flex-wrap items-center gap-2">
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCategory?.(c)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm ring-1 ring-gray-200 transition-colors duration-200 focus:outline-none focus-visible:ring-primary',
              category === c
                ? 'bg-primary text-white ring-primary'
                : 'bg-white text-gray-800 hover:bg-gray-100',
            )}
          >
            {c}
          </button>
        ))}
      </div>
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
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={verifiedOnly}
          onChange={onVerifiedOnly}
          aria-label="Verified Only"
        />
        Verified Only
      </label>
      {filtersActive && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-primary hover:underline ml-auto transition-colors duration-200"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
