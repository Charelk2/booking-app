'use client';
import { useState, useEffect } from 'react';
import { FunnelIcon } from '@heroicons/react/24/outline';
import SearchModal from '@/components/search/SearchModal';
import SearchBarInline from '@/components/search/SearchBarInline';
import useMediaQuery from '@/hooks/useMediaQuery';
import FilterSheet from './FilterSheet';

interface HeaderProps {
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
  verifiedOnly: boolean;
  onFilterApply: (params: {
    sort?: string;
    minPrice: number;
    maxPrice: number;
    verifiedOnly: boolean;
  }) => void;
  onFilterClear: () => void;
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
  verifiedOnly,
  onFilterApply,
  onFilterClear,
}: HeaderProps) {
  const isMobile = useMediaQuery('(max-width:768px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const [minPrice, setMinPrice] = useState(initialMinPrice);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [onlyVerified, setOnlyVerified] = useState(verifiedOnly);

  const filtersActive = Boolean(sort) ||
    onlyVerified ||
    minPrice !== initialMinPrice ||
    maxPrice !== initialMaxPrice;

  useEffect(() => {
    if (filterOpen) {
      setSort(initialSort);
      setMinPrice(initialMinPrice);
      setMaxPrice(initialMaxPrice);
      setOnlyVerified(verifiedOnly);
    }
  }, [filterOpen, initialSort, initialMinPrice, initialMaxPrice, verifiedOnly]);

  const compact = `${categoryLabel || 'All'} · ${location || 'Anywhere'}`;
  const dateStr = when ? when.toLocaleDateString() : 'Add date';

  return (
    <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
      <div className="flex items-center justify-between px-4 py-2">
        {isMobile ? (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex flex-col text-left bg-gray-100 hover:bg-gray-200 rounded-full px-4 py-2"
          >
            <span className="text-sm font-medium">{compact}</span>
            <span className="text-xs text-gray-500">{dateStr}</span>
          </button>
        ) : (
          <SearchBarInline
            categoryLabel={categoryLabel}
            categoryValue={categoryValue}
            location={location}
            when={when}
            onSearchEdit={onSearchEdit}
          />
        )}
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          className="flex items-center gap-1 text-sm relative"
        >
          <FunnelIcon className="h-5 w-5" /> Filters
          {filtersActive && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-indigo-600" />
          )}
        </button>
      </div>
      {isMobile && (
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
        verifiedOnly={onlyVerified}
        onVerifiedOnly={(v) => setOnlyVerified(v)}
        onApply={() =>
          onFilterApply({
            sort,
            minPrice,
            maxPrice,
            verifiedOnly: onlyVerified,
          })
        }
        onClear={() => {
          setSort('');
          setMinPrice(initialMinPrice);
          setMaxPrice(initialMaxPrice);
          setOnlyVerified(false);
          onFilterClear();
        }}
      />
    </div>
  );
}
