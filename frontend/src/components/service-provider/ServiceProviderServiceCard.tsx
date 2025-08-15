'use client';

import { useEffect, useState } from "react";
import Image from "next/image";
import { FunnelIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import SearchModal from "@/components/search/SearchModal";
import { format } from "date-fns";
import FilterSheet from "./FilterSheet";
import type { Service } from "@/types";
import { Button, Card } from "@/components/ui";
import { getService, type PriceBucket } from "@/lib/api";
import { SLIDER_MIN, SLIDER_MAX } from "@/lib/filter-constants";
import { formatCurrency, getFullImageUrl } from "@/lib/utils";

// Fetch the latest service data on mount so pricing and descriptions stay
// current without requiring a full page refresh.

interface ServiceProviderServiceCardProps {
  service: Service;
  onBook: (service: Service) => void;
}

export default function ServiceProviderServiceCard({ service, onBook }: ServiceProviderServiceCardProps) {
  const [currentService, setCurrentService] = useState<Service>(service);

  // keep local copy in sync with parent prop
  useEffect(() => {
    setCurrentService(service);
  }, [service]);

  // fetch latest details on mount
  useEffect(() => {
    getService(service.id)
      .then((res) => setCurrentService(res.data))
      .catch((err) => {
        console.error('Failed to refresh service:', err);
      });
  }, [service.id]);

  const formatDuration = (minutes: number) => {
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return `${minutes} min`;
  };

  return (
    <Card role="listitem" variant="flat">
      {/* Increased gap to add more spacing between media and details */}
      <div className="flex gap-6">
        {currentService.media_url && (
          <div className="relative w-35 h-35 flex-shrink-0 pr-4">
            <Image
              src={
                getFullImageUrl(currentService.media_url) || currentService.media_url
              }
              alt={currentService.title}
              fill
              unoptimized
              className="object-cover rounded-3xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFullImageUrl(
                  '/static/default-avatar.svg',
                ) as string;
              }}
            />
          </div>
        )}
        <div className="flex flex-col flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentService.title}
          </h3>
          {/* Price styling tweaked to be smaller and not bold, closer to title */}
          <div className="mt-0.5 text-sm text-gray-600 flex flex-wrap items-center gap-x-2">
            <span className="text-sm font-normal text-gray-900">
              {formatCurrency(Number(currentService.price))}
            </span>
            <span>per guest</span>
            <span aria-hidden="true">·</span>
            <span>{formatDuration(currentService.duration_minutes)}</span>
          </div>
          {currentService.description && (
            <p className="mt-1 text-sm text-gray-600">
              {currentService.description}
            </p>
          )}
          <div className="mt-2">
            <Button
              onClick={() => onBook(currentService)}
              fullWidth={false}
              className=" inline-flex items-center justify-center rounded-xl px-2 py-3 text-base font-semibold bg-gray-900 text-white shadow-sm active:scale-[0.99] transition disabled:opacity-50"
              title="The service provider will respond with a quote"
            >
              Request Booking
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface ServiceProvidersPageHeaderProps {
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

export function ServiceProvidersPageHeader({
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
}: ServiceProvidersPageHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtersActive =
    Boolean(initialSort) ||
    initialMinPrice !== SLIDER_MIN ||
    initialMaxPrice !== SLIDER_MAX;

  const dateLabel = when ? format(when, "d MMM yyyy") : "Add date";
  const locationLabel = location || "Anywhere";
  const categoryLabelText = categoryLabel || "Add service";

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
