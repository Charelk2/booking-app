"use client";

import { BottomSheet } from "@/components/ui";
import PriceFilter from "@/components/ui/PriceFilter";
import type { PriceBucket } from "@/lib/api";

const SORT_OPTIONS = [
  { value: "", label: "Best match" },
  { value: "closest", label: "Closest first" },
  { value: "top_rated", label: "Top rated" },
  { value: "most_booked", label: "Most booked" },
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
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      desktopCenter
      panelClassName="md:max-w-md md:rounded-2xl"
      title="Filters"
    >
      <PriceFilter
        open={open}
        initialMinPrice={initialMinPrice}
        initialMaxPrice={initialMaxPrice}
        priceDistribution={priceDistribution}
        sortOptions={SORT_OPTIONS}
        initialSort={initialSort}
        onApply={({ minPrice, maxPrice, sort }) => {
          parentOnApply({ sort: sort || undefined, minPrice, maxPrice });
        }}
        onClear={parentOnClear}
        onClose={onClose}
      />
    </BottomSheet>
  );
}
