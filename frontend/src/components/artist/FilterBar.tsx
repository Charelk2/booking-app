'use client';

import React, { useState, useEffect, forwardRef, Fragment, FC } from 'react';
import type { ChangeEventHandler } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import LocationInput from '@/components/ui/LocationInput';
import FilterSheet from '@/components/artist/FilterSheet';
import useIsMobile from '@/hooks/useIsMobile';

export interface FilterBarProps {
  categories: { value: string; label: string }[];
  location: string;
  onCategory?: (c: string | undefined) => void;
  onLocation: (value: string) => void;
  sort?: string;
  onSort: ChangeEventHandler<HTMLSelectElement>;
  onClear: () => void;
  onApply: (filters: { category?: string; minPrice?: number; maxPrice?: number }) => void;
  filtersActive: boolean;
  initialCategory?: string;
  initialMinPrice?: number;
  initialMaxPrice?: number;
}

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 200_000;
export const SLIDER_STEP = 100;
const formatCurrency = (v: number) => `R${new Intl.NumberFormat().format(v)}`;

const FilterBar: FC<FilterBarProps> = ({
  categories,
  location,
  onCategory,
  onLocation,
  sort,
  onSort,
  onClear,
  onApply,
  filtersActive,
  initialCategory,
  initialMinPrice = SLIDER_MIN,
  initialMaxPrice = SLIDER_MAX,
}) => {
  const [cat, setCat] = useState<string | undefined>(initialCategory);
  const [minPrice, setMinPrice] = useState<number>(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState<number>(initialMaxPrice);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setCat(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    setMinPrice(initialMinPrice);
  }, [initialMinPrice]);

  useEffect(() => {
    setMaxPrice(initialMaxPrice);
  }, [initialMaxPrice]);

  const handleCategory = (value: string) => {
    const next = cat === value ? undefined : value;
    setCat(next);
    onCategory?.(next);
  };

  const handleClearLocal = () => {
    setCat(undefined);
    setMinPrice(SLIDER_MIN);
    setMaxPrice(SLIDER_MAX);
    onClear();
  };

  const handleApplyLocal = () => {
    onApply({ category: cat, minPrice, maxPrice });
  };

  const SharedField = forwardRef<HTMLDivElement, { label: string; children: React.ReactNode }>(
    ({ label, children }, ref) => (
      <div ref={ref} className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">{label}</span>
        {children}
      </div>
    )
  );
  SharedField.displayName = 'SharedField';

  // Mobile view
  if (isMobile) {
    return (
      <div className="sm:hidden px-4 py-3">
        <button
          onClick={() => setSheetOpen(true)}
          className="w-full bg-white rounded-full shadow-lg p-3 text-gray-700"
        >
          Filters
        </button>
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          categories={categories.map((c) => c.value)}
          selectedCategory={cat}
          onSelectCategory={handleCategory}
          sort={sort}
          onSort={onSort}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
          onClear={() => {
            handleClearLocal();
            setSheetOpen(false);
          }}
          onApply={() => {
            handleApplyLocal();
            setSheetOpen(false);
          }}
        />
      </div>
    );
  }

  // Desktop pill bar
  return (
    <form className="hidden sm:flex items-stretch bg-white rounded-full shadow-lg overflow-visible">
      {/* Category */}
      <SharedField label="Category">
        <Listbox value={cat} onChange={handleCategory}>
          <div className="relative w-full">
            <Listbox.Button className="mt-1 w-full flex justify-between items-center text-sm text-gray-700 focus:outline-none">
              <span>{categories.find((c) => c.value === cat)?.label ?? 'Choose'}</span>
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            </Listbox.Button>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                {categories.map((c) => (
                  <Listbox.Option
                    key={c.value}
                    value={c.value}
                    className={({ active }) =>
                      `px-4 py-2 text-sm cursor-pointer ${
                        active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700'
                      }`
                    }
                  >
                    {c.label}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </SharedField>

      <div className="border-l border-gray-200" />

      {/* Where */}
      <SharedField label="Where">
        <LocationInput
          value={location}
          onChange={onLocation}
          placeholder="City or venue"
          className="mt-1 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
        />
      </SharedField>

      <div className="border-l border-gray-200" />

      {/* Sort */}
      <SharedField label="Sort">
        <select
          value={sort}
          onChange={onSort}
          className="mt-1 w-full text-sm text-gray-700 focus:outline-none"
        >
          <option value="">None</option>
          <option value="top_rated">Top Rated</option>
          <option value="most_booked">Most Booked</option>
          <option value="newest">Newest</option>
        </select>
      </SharedField>

      <div className="border-l border-gray-200" />

      {/* Price Range Slider */}
      <SharedField label="Price Range">
        <div className="relative mt-2 px-2">
          {/* Track */}
          <div className="h-1 bg-gray-200 rounded-full" />
          {/* Highlight */}
          <div
            className="absolute h-1 bg-indigo-600 rounded-full"
            style={{
              left: `${((minPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`,
              right: `${100 - ((maxPrice - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`,
            }}
          />
          {/* Min thumb */}
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={minPrice}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinPrice(v);
              if (v > maxPrice) setMaxPrice(v);
            }}
            className="absolute inset-0 w-full h-1 appearance-none bg-transparent pointer-events-auto"
          />
          {/* Max thumb */}
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={SLIDER_STEP}
            value={maxPrice}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxPrice(v);
              if (v < minPrice) setMinPrice(v);
            }}
            className="absolute inset-0 w-full h-1 appearance-none bg-transparent pointer-events-auto"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-700 mt-1 px-4">
          <span>{formatCurrency(minPrice)}</span>
          <span>{formatCurrency(maxPrice)}</span>
        </div>
      </SharedField>

      <div className="border-l border-gray-200" />

      {/* Clear / Apply */}
      <div className="flex items-center px-4 space-x-4">
        {filtersActive && (
          <button
            type="button"
            onClick={handleClearLocal}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={handleApplyLocal}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-full"
        >
          Apply
        </button>
      </div>
    </form>
  );
};

export default FilterBar;
