'use client';
import { useRef } from 'react';
import type { ChangeEventHandler } from 'react';
import { BottomSheet, Button } from '@/components/ui';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  categories: string[];
  selectedCategory?: string;
  onSelectCategory: (c: string) => void;
  verifiedOnly: boolean;
  onVerifiedOnly: (v: boolean) => void;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  onClear: () => void;
  onApply: () => void;
}

export default function FilterSheet({
  open,
  onClose,
  categories,
  selectedCategory,
  onSelectCategory,
  verifiedOnly,
  onVerifiedOnly,
  sort,
  onSort,
  onClear,
  onApply,
}: FilterSheetProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-4">
        <h2 className="text-lg font-medium">Filters</h2>
        <fieldset className="space-y-2">
          <legend className="font-medium">Categories</legend>
          {categories.map((c, idx) => (
            <label key={c} className="flex items-center gap-2">
              <input
                ref={idx === 0 ? firstRef : undefined}
                type="checkbox"
                checked={selectedCategory === c}
                onChange={() => onSelectCategory(c)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span>{c}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => onVerifiedOnly(e.target.checked)}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
          />
          <span>Verified Only</span>
        </label>
        <div>
          <label htmlFor="sheet-sort" className="block text-sm font-medium mb-1">
            Sort
          </label>
          <select
            id="sheet-sort"
            value={sort}
            onChange={onSort}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            <option value="">Sort</option>
            <option value="top_rated">Top Rated</option>
            <option value="most_booked">Most Booked</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 w-full flex gap-2 p-4 border-t bg-white">
        <button
          type="button"
          onClick={() => {
            onClear();
          }}
          className="flex-1 text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          Clear all
        </button>
        <Button
          type="button"
          onClick={() => {
            onApply();
            onClose();
          }}
          className="flex-1"
          fullWidth
        >
          Apply filters
        </Button>
      </div>
    </BottomSheet>
  );
}
