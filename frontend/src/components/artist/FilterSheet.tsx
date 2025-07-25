"use client";
import { useRef, useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useMediaQuery from "@/hooks/useMediaQuery";
import { BottomSheet } from "@/components/ui";
import { createPortal } from "react-dom";
import {
  SLIDER_MIN,
  SLIDER_MAX,
  SLIDER_STEP,
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
  initialSort?: string;
  initialMinPrice: number;
  initialMaxPrice: number;
  onApply: (filters: { sort?: string; minPrice: number; maxPrice: number }) => void;
  onClear: () => void;
  priceDistribution: PriceBucket[];
}

export default function FilterSheet({
  open,
  onClose,
  initialSort,
  initialMinPrice,
  initialMaxPrice,
  onApply: parentOnApply,
  onClear: parentOnClear,
  priceDistribution,
}: FilterSheetProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMediaQuery("(min-width:768px)");
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);
  const [mounted, setMounted] = useState(false);

  const [localMinPrice, setLocalMinPrice] = useState(initialMinPrice);
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);
  const [localSort, setLocalSort] = useState(initialSort || "");

  useEffect(() => {
    if (open) {
      setLocalMinPrice(initialMinPrice);
      setLocalMaxPrice(initialMaxPrice);
      setLocalSort(initialSort || "");
    }
  }, [open, initialMinPrice, initialMaxPrice, initialSort]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const maxCount = priceDistribution.reduce(
    (max, bucket) => Math.max(max, bucket.count),
    0,
  );

  const minPct = ((localMinPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
  const maxPct = ((localMaxPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

  const handleRangeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'min' | 'max',
  ) => {
    const v = Number(e.target.value);
    if (type === 'min') {
      setLocalMinPrice(v);
      if (v > localMaxPrice) setLocalMaxPrice(v);
    } else {
      setLocalMaxPrice(v);
      if (v < localMinPrice) setLocalMinPrice(v);
    }
  };

  const handleNumberInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'min' | 'max',
  ) => {
    const value = parseInt(e.target.value, 10);
    if (!Number.isNaN(value)) {
      if (type === 'min') {
        setLocalMinPrice(Math.min(value, SLIDER_MAX));
        if (value > localMaxPrice) {
          setLocalMaxPrice(Math.min(value, SLIDER_MAX));
        }
      } else {
        setLocalMaxPrice(Math.max(value, SLIDER_MIN));
        if (value < localMinPrice) {
          setLocalMinPrice(Math.max(value, SLIDER_MIN));
        }
      }
    }
  };

  const handleApplyClick = () => {
    parentOnApply({
      sort: localSort || undefined,
      minPrice: localMinPrice,
      maxPrice: localMaxPrice,
    });
    onClose();
  };

  const handleClearClick = () => {
    parentOnClear();
    onClose();
  };

  if (!open || !mounted) return null;

  const content = (
    <>
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
          value={localSort}
          onChange={(e) => setLocalSort(e.target.value)}
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
        <p className="text-xs text-gray-500">Trip price, includes all fees.</p>
        <div className="histogram-container relative mt-4">
          <div className="histogram-bars absolute inset-0 flex items-end justify-between px-0.5">
            {priceDistribution.map((bucket, index) => (
              <div key={index} style={{ height: `${(bucket.count / maxCount) * 60}%` }} />
            ))}
          </div>
          <div className="price-track" />
          <div
            className="price-fill"
            style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
          />
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={localMinPrice}
            onChange={(e) => handleRangeChange(e, 'min')}
            onMouseDown={() => setActiveThumb('min')}
            onTouchStart={() => setActiveThumb('min')}
            onMouseUp={() => setActiveThumb(null)}
            onTouchEnd={() => setActiveThumb(null)}
            className={`range-thumb ${activeThumb === 'min' ? 'active' : ''}`}
          />
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={localMaxPrice}
            onChange={(e) => handleRangeChange(e, 'max')}
            onMouseDown={() => setActiveThumb('max')}
            onTouchStart={() => setActiveThumb('max')}
            onMouseUp={() => setActiveThumb(null)}
            onTouchEnd={() => setActiveThumb(null)}
            className={`range-thumb ${activeThumb === 'max' ? 'active' : ''}`}
          />
        </div>
        <div className="flex justify-between mt-4 gap-4">
          <div className="flex-1">
            <label htmlFor="min-price-input" className="block text-xs font-medium text-gray-700 mb-1">
              Min
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
              <input
                id="min-price-input"
                type="number"
                value={localMinPrice}
                onChange={(e) => handleNumberInputChange(e, 'min')}
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
              />
            </div>
          </div>
          <div className="flex-1">
            <label htmlFor="max-price-input" className="block text-xs font-medium text-gray-700 mb-1">
              Max
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">R</span>
              <input
                id="max-price-input"
                type="number"
                value={localMaxPrice}
                onChange={(e) => handleNumberInputChange(e, 'max')}
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <button type="button" className="text-gray-600" onClick={handleClearClick}>
          Clear all
        </button>
        <button
          type="button"
          className="bg-brand text-white px-6 py-2 rounded-md"
          onClick={handleApplyClick}
        >
          Apply filters
        </button>
      </div>
    </>
  );

  if (isDesktop) {
    return createPortal(
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-auto space-y-6" ref={firstRef}>
          {content}
        </div>
      </div>,
      document.getElementById('modal-root')!
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} initialFocus={firstRef}>
      <div className="p-4 pb-32 space-y-6" ref={firstRef}>{content}</div>
    </BottomSheet>
  );
}
