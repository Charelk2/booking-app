'use client';
import { useState } from 'react';
import { FunnelIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import SearchModal from '@/components/search/SearchModal';
import useMediaQuery from '@/hooks/useMediaQuery';
import { BREAKPOINT_MD } from '@/lib/breakpoints';
import { format } from 'date-fns';
import FilterSheet from './FilterSheet';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';
import type { PriceBucket } from '@/lib/api';
import { Button } from '@/components/ui';

export interface ArtistsPageHeaderProps {
  categoryLabel?: string;
  categoryValue?: string;
  location?: string;
  when?: Date | null;
  onSearchEdit: (params: {
    category?: string;
    location?: string;
    when?: Date | null;
  }) => void;
  // filter props
  initialSort?: string;
  initialMinPrice: number;
  initialMaxPrice: number;
  priceDistribution: PriceBucket[];
  onFilterApply: (params: {
    sort?: string;
    minPrice: number;
    maxPrice: number;
  }) => void;
  onFilterClear: () => void;
  /** Render only the filter icon without search button */
  iconOnly?: boolean;
}

export default function ArtistsPageHeader({
  categoryLabel,
  categoryValue,
  location,
  when,
  onSearchEdit,
  initialSort,
  initialMinPrice,
  initialMaxPrice,
  priceDistribution,
  onFilterApply,
  onFilterClear,
  iconOnly,
}: ArtistsPageHeaderProps) {
  const isDesktop = useMediaQuery(`(min-width:${BREAKPOINT_MD}px)`);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtersActive =
    Boolean(initialSort) ||
    initialMinPrice !== SLIDER_MIN ||
    initialMaxPrice !== SLIDER_MAX;

  const dateLabel = when ? format(when, 'd MMM yyyy') : 'Add date';
  const locationLabel = location || 'Anywhere';
  const categoryLabelText = categoryLabel || 'Add service';

  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative p-2"
          aria-label="Filters"
        >
          <FunnelIcon className="h-5 w-5" />
          {filtersActive && (
            <span className="absolute top-0 right-0 h-2 w-2 bg-pink-500 rounded-full" />
          )}
        </button>
        <FilterSheet
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          initialSort={initialSort}
          initialMinPrice={initialMinPrice}
          initialMaxPrice={initialMaxPrice}
          priceDistribution={priceDistribution}
          onApply={onFilterApply}
          onClear={onFilterClear}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex w-full items-center justify-between md:justify-start md:gap-4">
        <div
          className="flex-grow flex items-center justify-between rounded-full border border-gray-300 shadow-md transition-shadow duration-200 hover:shadow-lg"
          onClick={() => setSearchOpen(true)}
          role="button"
          aria-label="Open search menu"
        >
          <div className="py-2 px-4 flex flex-col items-start min-w-[120px]">
            <span className="text-sm font-medium">Location</span>
            <span className="text-xs text-gray-500 truncate">{locationLabel}</span>
          </div>
          <div className="py-2 px-4 flex flex-col items-start border-l border-r border-gray-300 min-w-[120px]">
            <span className="text-sm font-medium">When</span>
            <span className="text-xs text-gray-500 truncate">{dateLabel}</span>
          </div>
          <div className="py-2 px-4 flex flex-col items-start min-w-[120px]">
            <span className="text-sm font-medium">Service Type</span>
            <span className="text-xs text-gray-500 truncate">{categoryLabelText}</span>
          </div>
          <div className="p-2 ml-auto">
            <Button
              type="button"
              className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center"
              fullWidth={false}
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative p-2 rounded-full border border-gray-300 text-sm flex items-center gap-1"
          aria-label="Filters"
        >
          <FunnelIcon className="h-5 w-5" />
          {filtersActive && (
            <span className="absolute top-0 right-0 h-2 w-2 bg-pink-500 rounded-full" />
          )}
        </button>
      </div>
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialCategory={categoryValue}
        initialLocation={location}
        initialWhen={when}
        onSearch={onSearchEdit}
      />
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        initialSort={initialSort}
        initialMinPrice={initialMinPrice}
        initialMaxPrice={initialMaxPrice}
        priceDistribution={priceDistribution}
        onApply={onFilterApply}
        onClear={onFilterClear}
      />
    </>
  );
}