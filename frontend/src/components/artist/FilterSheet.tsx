"use client";
import { useRef, useEffect, useState } from "react";
import type { ChangeEventHandler } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useMediaQuery from "@/hooks/useMediaQuery";
import { BottomSheet } from "@/components/ui";
import { createPortal } from "react-dom";
import {
  SLIDER_MIN,
  SLIDER_MAX,
  SLIDER_STEP,
  formatCurrency,
} from "@/lib/filter-constants";
import type { PriceBucket } from "@/lib/api";

// Available sort values must exactly match the backend pattern.
const SORT_OPTIONS = [
  { value: "", label: "Sort" },
  { value: "top_rated", label: "Top Rated" },
  { value: "most_booked", label: "Most Booked" },
  { value: "newest", label: "Newest" },
];

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
  priceDistribution: PriceBucket[];
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
  priceDistribution,
}: FilterSheetProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMediaQuery("(min-width:768px)");
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const maxCount = priceDistribution.reduce(
    (max, bucket) => Math.max(max, bucket.count),
    0,
  );

  if (!open || !mounted) return null;

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
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Price range</label>
        <div className="mt-4 relative h-20">
          <div className="absolute inset-0 flex items-end justify-between px-0.5 pointer-events-none">
            {priceDistribution.map((bucket, index) => (
              <div
                key={index}
                className="bg-gray-400 w-2 rounded-t-sm"
                style={{ height: `${(bucket.count / (maxCount || 1)) * 70}%` }}
              />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-2 bg-gray-200 rounded" />
          <div
            className="absolute bottom-0 h-2 bg-pink-500 rounded"
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
            onMouseDown={() => setActiveThumb('min')}
            onTouchStart={() => setActiveThumb('min')}
            onMouseUp={() => setActiveThumb(null)}
            onTouchEnd={() => setActiveThumb(null)}
            style={{ zIndex: activeThumb === 'min' ? 20 : 10 }}
            className="custom-range-thumb absolute inset-x-0 bottom-0 w-full h-2 appearance-none bg-transparent pointer-events-auto"
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
            onMouseDown={() => setActiveThumb('max')}
            onTouchStart={() => setActiveThumb('max')}
            onMouseUp={() => setActiveThumb(null)}
            onTouchEnd={() => setActiveThumb(null)}
            style={{ zIndex: activeThumb === 'max' ? 20 : 10 }}
            className="custom-range-thumb absolute inset-x-0 bottom-0 w-full h-2 appearance-none bg-transparent pointer-events-auto"
          />
        </div>
        <div className="flex justify-between mt-4 gap-3">
          <div className="flex-1">
            <label htmlFor="min-price-input" className="block text-xs font-medium text-gray-700 mb-1">
              Minimum
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
              <input
                id="min-price-input"
                type="number"
                value={minPrice}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value)) {
                    onPriceChange(value, Math.max(value, maxPrice));
                  }
                }}
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
              />
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="max-price-input" className="block text-xs font-medium text-gray-700 mb-1">
              Maximum
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
              <input
                id="max-price-input"
                type="number"
                value={maxPrice}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value)) {
                    onPriceChange(Math.min(value, minPrice), value);
                  }
                }}
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
              />
            </div>
          </div>
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
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md mx-auto w-full">
          {content}
        </div>
      </div>,
      document.getElementById('modal-root')!
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-4">{content}</div>
    </BottomSheet>
  );
}
