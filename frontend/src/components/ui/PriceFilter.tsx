'use client';

import { useState, useEffect, useCallback } from 'react';
import 'rheostat/initialize';
import 'rheostat/css/rheostat.css'; // Make sure this CSS is loaded globally or here.
import Rheostat from 'rheostat';
import type { PublicState } from 'rheostat';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';

export interface PriceFilterProps {
  open: boolean;
  initialMinPrice: number;
  initialMaxPrice: number;
  priceDistribution: { count: number }[];
  onApply: (f: { minPrice: number; maxPrice: number }) => void;
  onClear: () => void;
  onClose: () => void; // Added for closing the modal
}

export default function PriceFilter({
  open,
  initialMinPrice,
  initialMaxPrice,
  priceDistribution,
  onApply,
  onClear,
  onClose,
}: PriceFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localMinPrice, setLocalMinPrice] = useState(initialMinPrice);
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  // Synchronize local state with initial props when the modal opens
  useEffect(() => {
    if (open) {
      setLocalMinPrice(initialMinPrice);
      setLocalMaxPrice(initialMaxPrice);
    }
  }, [open, initialMinPrice, initialMaxPrice]);

  // Calculate the maximum count for scaling the price distribution bars
  const maxCount = priceDistribution.reduce((m, b) => Math.max(m, b.count), 0);

  // Function to update the URL with new price parameters
  const updateUrl = useCallback(
    (min: number, max: number) => {
      const search = new URLSearchParams(searchParams.toString());
      if (min > SLIDER_MIN) search.set('price_min', String(min));
      else search.delete('price_min');
      if (max < SLIDER_MAX) search.set('price_max', String(max));
      else search.delete('price_max');
      router.push(`${pathname}?${search.toString()}`);
    },
    [pathname, router, searchParams],
  );

  // Handler for applying filters (called on button click or slider change completion)
  const handleApply = useCallback(() => {
    onApply({ minPrice: localMinPrice, maxPrice: localMaxPrice });
    updateUrl(localMinPrice, localMaxPrice);
    onClose(); // Close the modal after applying
  }, [localMinPrice, localMaxPrice, onApply, onClose, updateUrl]);

  // Handler for clearing filters
  const handleClear = useCallback(() => {
    setLocalMinPrice(SLIDER_MIN);
    setLocalMaxPrice(SLIDER_MAX);
    onClear();
    updateUrl(SLIDER_MIN, SLIDER_MAX);
    onClose(); // Close the modal after clearing
  }, [onClear, onClose, updateUrl]);

  // Custom Handle component for Rheostat to add active styling and size
  const Handle = (props: any) => {
    const idx = Number(props['data-handle-key']);
    return (
      <button
        type="button"
        aria-label={idx === 0 ? 'Minimum price handle' : 'Maximum price handle'}
        {...props}
        onMouseDown={(e) => {
          setActiveHandle(idx);
          props.onMouseDown?.(e);
        }}
        onTouchStart={(e) => {
          setActiveHandle(idx);
          props.onTouchStart?.(e);
        }}
        onBlur={(e) => {
          setActiveHandle(null);
          props.onBlur?.(e);
        }}
        className={clsx(
          // Changed w-4 h-4 to w-5 h-5 and adjusted -top-2 to -top-2.5 for better centering
          'absolute -top-2.5 w-5 h-5 rounded-full border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-pink-500 transition-shadow duration-200 ease-in-out',
          props.className,
          { 'shadow-lg ring-4 ring-pink-200': activeHandle === idx },
        )}
        style={{
          ...props.style,
          // Ensure the active handle is on top
          zIndex:
            activeHandle === idx
              ? 30
              : idx === 0
                ? localMinPrice === localMaxPrice
                  ? 30
                  : 10
                : 20,
        }}
      />
    );
  };

  // Custom Progress bar component for Rheostat
  const Progress = ({ style }: { style: React.CSSProperties }) => (
    <div className="absolute bottom-0 h-2 bg-pink-500 rounded" style={style} />
  );

  // Custom Background for Rheostat
  const Background = () => (
    <div className="absolute inset-x-0 bottom-0 h-2 bg-gray-200 rounded" />
  );

  if (!open) return null; // Only render the modal if 'open' is true

  return (
    // Overlay for the modal
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      {/* Modal Content */}
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-auto shadow-xl space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex justify-between items-center relative">
          <h2 className="text-xl font-semibold text-gray-900">Filters</h2>
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
              className="h-6 w-6"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sort By Section */}
        <div className="border-t border-gray-200 pt-6">
          <label htmlFor="sheet-sort" className="block text-sm font-medium text-gray-700 mb-2">
            Sort by
          </label>
          <select
            id="sheet-sort"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white text-gray-800 focus:ring-pink-500 focus:border-pink-500 transition-all duration-200 appearance-none pr-8"
          >
            <option value="">Sort</option>
            <option value="top_rated">Top Rated</option>
            <option value="most_booked">Most Booked</option>
            <option value="newest">Newest</option>
          </select>
          {/* Add a custom arrow for the select if needed, e.g., using an SVG */}
        </div>

        {/* Price Range Section */}
        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-medium text-gray-700">Price range</label>
          <p className="text-xs text-gray-500 mt-1 mb-4">Trip price, includes all fees.</p>

          {/* Price Distribution Graph */}
          {/* Changed mb-6 to mb-2 to bring the bars closer to the slider */}
          <div className="relative h-16 w-full mb-2 flex items-end justify-between px-1">
            {priceDistribution.map((b, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                className="w-1 bg-gray-300 rounded-t-sm"
                // Scale bar height based on maxCount. Add a min-height for visibility if count is 0.
                style={{ height: `${(b.count / (maxCount || 1)) * 100 * 0.8 + 10}%` }} // Scale to 80% height + 10% base
              />
            ))}
          </div>

          {/* Rheostat Slider */}
          {/* Adjusted my-4 to mt-0 for more fine-grained control with mb-2 above */}
          <div className="mt-0 mb-4">
            <Rheostat
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              values={[localMinPrice, localMaxPrice]}
              onValuesUpdated={({ values }: PublicState) => {
                setLocalMinPrice(values[0]);
                setLocalMaxPrice(values[1]);
              }}
              // onChange is typically called when the user releases the handle
              onChange={({ values }: PublicState) => {
                // If you want results to update live as you drag, uncomment the line below.
                // updateUrl(values[0], values[1]);
              }}
              handle={Handle}
              progressBar={Progress}
              background={Background}
            />
          </div>

          {/* Min/Max Price Input Fields */}
          <div className="flex justify-between items-center gap-4 mt-6">
            <div className="flex-1">
              <label htmlFor="min-price" className="block text-xs font-medium text-gray-500 mb-1">
                Minimum
              </label>
              <input
                type="text"
                id="min-price"
                value={`R ${localMinPrice.toLocaleString()}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-medium focus:ring-pink-500 focus:border-pink-500 bg-gray-50 cursor-not-allowed"
                readOnly
              />
            </div>
            <div className="text-gray-400 mt-6 font-semibold">–</div>
            <div className="flex-1">
              <label htmlFor="max-price" className="block text-xs font-medium text-gray-500 mb-1">
                Maximum
              </label>
              <input
                type="text"
                id="max-price"
                value={`R ${localMaxPrice.toLocaleString()}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 font-medium focus:ring-pink-500 focus:border-pink-500 bg-gray-50 cursor-not-allowed"
                readOnly
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between border-t border-gray-200 pt-6 mt-6">
          <button
            type="button"
            className="px-5 py-2 rounded-lg text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
            onClick={handleClear}
          >
            Clear all
          </button>
          <button
            type="button"
            className="px-6 py-2 rounded-lg bg-pink-500 text-white font-semibold hover:bg-pink-600 transition-colors shadow-md"
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
