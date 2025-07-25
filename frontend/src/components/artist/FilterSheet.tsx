"use client";
import { useRef, useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import useMediaQuery from "@/hooks/useMediaQuery";
import { BottomSheet } from "@/components/ui";
import PriceFilter from "@/components/ui/PriceFilter";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const [localSort, setLocalSort] = useState(initialSort || "");

  useEffect(() => {
    if (open) {
      setLocalSort(initialSort || "");
    }
  }, [open, initialSort]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);


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
        <PriceFilter
          open={open}
          initialMinPrice={initialMinPrice}
          initialMaxPrice={initialMaxPrice}
          priceDistribution={priceDistribution}
          onApply={({ minPrice, maxPrice }) => {
            parentOnApply({ sort: localSort || undefined, minPrice, maxPrice });
            onClose();
          }}
          onClear={() => {
            parentOnClear();
            onClose();
          }}
        />
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
