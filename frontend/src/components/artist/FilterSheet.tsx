'use client';
import { useRef } from 'react';
import type { ChangeEventHandler } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import {
  SLIDER_MIN,
  SLIDER_MAX,
  SLIDER_STEP,
  formatCurrency,
} from '@/lib/filter-constants';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  verifiedOnly: boolean;
  onVerifiedOnly: (v: boolean) => void;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  onClear: () => void;
  onApply: () => void;
  minPrice: number;
  maxPrice: number;
  onPriceChange: (min: number, max: number) => void;
}

export default function FilterSheet({
  open,
  onClose,
  verifiedOnly,
  onVerifiedOnly,
  sort,
  onSort,
  onClear,
  onApply,
  minPrice,
  maxPrice,
  onPriceChange,
}: FilterSheetProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-4">
        <h2 className="text-lg font-medium">Filters</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => onVerifiedOnly(e.target.checked)}
            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            ref={firstRef}
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
        <div className="pt-2">
          <label className="block text-sm font-medium mb-1">Price Range</label>
          <div className="relative mt-2 px-2">
            <div className="h-1 bg-gray-200 rounded-full" />
            <div
              className="absolute h-1 bg-indigo-600 rounded-full"
              style={{
                left: `${((minPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`,
                right: `${100 - ((maxPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`,
              }}
            />
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={minPrice}
              onChange={(e) => {
                const v = Number(e.target.value);
                onPriceChange(v, Math.max(v, maxPrice));
              }}
              className="absolute inset-0 w-full h-1 appearance-none bg-transparent pointer-events-auto"
            />
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={maxPrice}
              onChange={(e) => {
                const v = Number(e.target.value);
                onPriceChange(Math.min(v, minPrice), v);
              }}
              className="absolute inset-0 w-full h-1 appearance-none bg-transparent pointer-events-auto"
            />
          </div>
          <div className="flex justify-between text-xs text-gray-700 mt-1 px-4">
            <span>{formatCurrency(minPrice)}</span>
            <span>{formatCurrency(maxPrice)}</span>
          </div>
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
