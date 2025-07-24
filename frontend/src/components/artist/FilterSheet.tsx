"use client";
import { useRef } from "react";
import type { ChangeEventHandler } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useMediaQuery from "@/hooks/useMediaQuery";
import { BottomSheet } from "@/components/ui";
import {
  SLIDER_MIN,
  SLIDER_MAX,
  SLIDER_STEP,
  formatCurrency,
} from "@/lib/filter-constants";

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
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
  sort,
  onSort,
  onClear,
  onApply,
  minPrice,
  maxPrice,
  onPriceChange,
}: FilterSheetProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMediaQuery("(min-width:768px)");
  if (!open) return null;

  const content = (
    <div className="space-y-6" ref={firstRef}>
      <div className="flex justify-center relative">
        <h2 className="text-lg font-bold">Filters</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-0 top-0"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <div>
        <label htmlFor="sheet-sort" className="block text-sm font-medium">
          Sort
        </label>
        <select
          id="sheet-sort"
          value={sort}
          onChange={onSort}
          className="w-full border border-gray-200 rounded-md px-4 py-2 mt-2"
        >
          <option value="">Sort</option>
          <option value="top_rated">Top Rated</option>
          <option value="most_booked">Most Booked</option>
          <option value="newest">Newest</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Price range</label>
        <p className="text-xs text-gray-500">Trip price, includes all fees.</p>
        <div className="mt-4 relative">
          <div className="h-2 bg-gray-200 rounded" />
          <div
            className="absolute h-2 bg-pink-500 rounded"
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
            className="custom-range-thumb absolute inset-0 w-full h-2 appearance-none bg-transparent pointer-events-auto"
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
            className="custom-range-thumb absolute inset-0 w-full h-2 appearance-none bg-transparent pointer-events-auto"
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-600">
          <span>{formatCurrency(minPrice)}</span>
          <span>{formatCurrency(maxPrice)}</span>
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <button type="button" className="text-gray-600" onClick={onClear}>
          Clear all
        </button>
        <button
          type="button"
          className="bg-brand text-white px-6 py-2 rounded-md"
          onClick={() => {
            onApply();
            onClose();
          }}
        >
          Apply filters
        </button>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md mx-auto w-full">
          {content}
        </div>
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-4">{content}</div>
    </BottomSheet>
  );
}
