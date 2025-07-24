'use client';
import { useState, useEffect } from 'react';
import { FunnelIcon } from '@heroicons/react/24/outline';
import SearchModal from '@/components/search/SearchModal';
import useMediaQuery from '@/hooks/useMediaQuery';
import { format } from 'date-fns';
import FilterSheet from './FilterSheet';
import { SLIDER_MIN, SLIDER_MAX } from '@/lib/filter-constants';

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
  onFilterApply,
  onFilterClear,
  iconOnly,
}: ArtistsPageHeaderProps) {
  const isDesktop = useMediaQuery('(min-width:768px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);

  const filtersActive =
    Boolean(sort) ||
    minPrice !== SLIDER_MIN ||
    maxPrice !== SLIDER_MAX;

  useEffect(() => {
    if (filterOpen) {
      setSort(initialSort);
      setMinPrice(initialMinPrice);
      setMaxPrice(initialMaxPrice);
    }
  }, [filterOpen, initialSort, initialMinPrice, initialMaxPrice]);

  const compact = `${categoryLabel || 'All'} · ${location || 'Anywhere'}`;
  const dateStr = when ? format(when, 'd MMM yyyy') : 'Add date';

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
          sort={sort}
          onSort={(e) => setSort(e.target.value)}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onPriceChange={(min, max) => {
            setMinPrice(min);
            setMaxPrice(max);
          }}
          onApply={() =>
            onFilterApply({
              sort,
              minPrice,
              maxPrice,
            })
          }
          onClear={() => {
            setSort('');
            setMinPrice(initialMinPrice);
            setMaxPrice(initialMaxPrice);
            onFilterClear();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between md:justify-start md:gap-2">
        {!isDesktop && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex flex-col text-left bg-gray-100 hover:bg-gray-200 rounded-full px-4 py-2"
          >
            <span className="text-sm font-medium">{compact}</span>
            <span className="text-xs text-gray-500">{dateStr}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="relative px-4 py-2 text-sm flex items-center gap-1"
        >
          <FunnelIcon className="h-5 w-5" />
          <span>Filters</span>
          {filtersActive && (
            <span className="absolute top-0 right-0 h-2 w-2 bg-pink-500 rounded-full" />
          )}
        </button>
      </div>
      {!isDesktop && (
        <SearchModal
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          initialCategory={categoryValue}
          initialLocation={location}
          initialWhen={when}
          onSearch={onSearchEdit}
        />
      )}
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        sort={sort}
        onSort={(e) => setSort(e.target.value)}
        minPrice={minPrice}
        maxPrice={maxPrice}
        onPriceChange={(min, max) => {
          setMinPrice(min);
          setMaxPrice(max);
        }}
        onApply={() =>
          onFilterApply({
            sort,
            minPrice,
            maxPrice,
          })
        }
        onClear={() => {
          setSort('');
          setMinPrice(initialMinPrice);
          setMaxPrice(initialMaxPrice);
          onFilterClear();
        }}
      />
    </>
  );
}
