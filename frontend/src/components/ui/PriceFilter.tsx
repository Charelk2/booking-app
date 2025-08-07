"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "rheostat/initialize";
import "rheostat/css/rheostat.css";
import Rheostat from "rheostat";
import type { PublicState } from "rheostat";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { SLIDER_MIN, SLIDER_MAX } from "@/lib/filter-constants";

interface SortOption {
  value: string;
  label: string;
}

export interface PriceFilterProps {
  open: boolean;
  initialMinPrice: number;
  initialMaxPrice: number;
  priceDistribution: { count: number }[];
  onApply: (f: { minPrice: number; maxPrice: number }) => void;
  onClear: () => void;
  onClose: () => void;

  sortOptions: SortOption[];
  initialSort?: string;
  onSortChange: (sortValue: string) => void;
}

export default function PriceFilter({
  open,
  initialMinPrice,
  initialMaxPrice,
  priceDistribution,
  onApply,
  onClear,
  onClose,
  sortOptions,
  initialSort,
  onSortChange,
}: PriceFilterProps) {
  // ALL HOOKS MUST BE CALLED AT THE TOP LEVEL, UNCONDITIONALLY
  // State for Price Range
  const [localMinPrice, setLocalMinPrice] = useState(initialMinPrice);
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  // State for Custom Sort Dropdown
  const [localSortValue, setLocalSortValue] = useState(initialSort || "");
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Routers
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initialize states when the filter modal opens or initial values change
  useEffect(() => {
    if (open) {
      setLocalMinPrice(initialMinPrice);
      setLocalMaxPrice(initialMaxPrice);
      setLocalSortValue(initialSort || "");
      setIsSortDropdownOpen(false);
      previouslyFocused.current = document.activeElement as HTMLElement;
      closeButtonRef.current?.focus();
    }
    if (!open && previouslyFocused.current) {
      previouslyFocused.current.focus();
    }
  }, [open, initialMinPrice, initialMaxPrice, initialSort]);

  const maxCount = priceDistribution.reduce((m, b) => Math.max(m, b.count), 0);

  // Function to update URL parameters (price and sort)
  const updateUrl = useCallback(
    (min: number, max: number, sort?: string) => {
      const search = new URLSearchParams(searchParams.toString());
      if (min > SLIDER_MIN) search.set("price_min", String(min));
      else search.delete("price_min");
      if (max < SLIDER_MAX) search.set("price_max", String(max));
      else search.delete("price_max");

      if (sort) search.set("sort", sort);
      else search.delete("sort");

      router.push(`${pathname}?${search.toString()}`);
    },
    [pathname, router, searchParams],
  );

  // Handle Apply button click
  const handleApplyClick = useCallback(() => {
    onApply({ minPrice: localMinPrice, maxPrice: localMaxPrice });
    onSortChange(localSortValue);
    updateUrl(localMinPrice, localMaxPrice, localSortValue);
    onClose();
  }, [
    localMinPrice,
    localMaxPrice,
    localSortValue,
    onApply,
    onSortChange,
    onClose,
    updateUrl,
  ]);

  // Handle Clear all button click
  const handleClearClick = useCallback(() => {
    setLocalMinPrice(SLIDER_MIN);
    setLocalMaxPrice(SLIDER_MAX);
    setLocalSortValue("");
    onClear();
    onSortChange("");
    updateUrl(SLIDER_MIN, SLIDER_MAX, "");
    onClose();
  }, [onClear, onSortChange, onClose, updateUrl]);

  // Handle input change for min price field
  const handleMinPriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value.replace(/[^0-9]/g, "")); // Remove non-numeric characters
      if (isNaN(value)) {
        setLocalMinPrice(SLIDER_MIN);
      } else {
        setLocalMinPrice(Math.max(SLIDER_MIN, Math.min(value, localMaxPrice)));
      }
    },
    [localMaxPrice],
  );

  // Handle input change for max price field
  const handleMaxPriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value.replace(/[^0-9]/g, "")); // Remove non-numeric characters
      if (isNaN(value)) {
        setLocalMaxPrice(SLIDER_MAX);
      } else {
        setLocalMaxPrice(Math.min(SLIDER_MAX, Math.max(value, localMinPrice)));
      }
    },
    [localMinPrice],
  );

  // Click outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSortDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const handleTrap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        container?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) || [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container?.addEventListener("keydown", handleTrap);
    return () => {
      container?.removeEventListener("keydown", handleTrap);
    };
  }, [open]);

  // Handle keyboard navigation for the custom dropdown
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isSortDropdownOpen) return;

      const options = Array.from(
        sortDropdownRef.current?.querySelectorAll('[role="option"]') || [],
      );
      const focusedIndex = options.findIndex(
        (option) => option === document.activeElement,
      );

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = (focusedIndex + 1) % options.length;
        (options[nextIndex] as HTMLElement)?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prevIndex = (focusedIndex - 1 + options.length) % options.length;
        (options[prevIndex] as HTMLElement)?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (
          document.activeElement &&
          document.activeElement.getAttribute("role") === "option"
        ) {
          (document.activeElement as HTMLElement)?.click();
        }
      } else if (event.key === "Escape") {
        setIsSortDropdownOpen(false);
        sortDropdownRef.current?.querySelector("button")?.focus();
      }
    },
    [isSortDropdownOpen],
  );

  useEffect(() => {
    if (isSortDropdownOpen) {
      document.addEventListener("keydown", handleKeyDown);
      const selectedOption = sortDropdownRef.current?.querySelector(
        `[aria-selected="true"]`,
      );
      if (selectedOption) {
        (selectedOption as HTMLElement)?.focus();
      } else if (sortOptions.filter((opt) => opt.value !== "").length > 0) {
        (
          sortDropdownRef.current?.querySelector(
            '[role="option"]',
          ) as HTMLElement
        )?.focus();
      }
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSortDropdownOpen, handleKeyDown, sortOptions]);

  // Rheostat Custom Components
  const Handle = (
    props: React.HTMLAttributes<HTMLButtonElement> & {
      "data-handle-key": string;
    },
  ) => {
    const idx = Number(props["data-handle-key"]);
    return (
      <button
        type="button"
        aria-label={idx === 0 ? "Minimum price handle" : "Maximum price handle"}
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
          "absolute -top-2.5 h-5 w-5 rounded-full border border-gray-300 bg-white transition-shadow duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
          props.className,
          {
            "ring-[var(--color-accent)]/50 shadow-lg ring-4":
              activeHandle === idx,
          },
        )}
        style={{
          ...props.style,
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

  const Progress = ({ style }: { style: React.CSSProperties }) => (
    <div
      className="absolute bottom-0 h-2 rounded bg-[var(--color-accent)]"
      style={style}
    />
  );

  const Background = () => (
    <div className="absolute inset-x-0 bottom-0 h-2 rounded bg-gray-200" />
  );

  // IMPORTANT FIX: CONDITIONAL RENDERING AFTER ALL HOOKS ARE CALLED
  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-50"
      role="dialog"
      aria-modal="true"
      ref={containerRef}
    >
      <div className="animate-fade-in-up mx-auto w-full max-w-md space-y-6 rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="relative flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Filters</h2>
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="text-gray-500 transition-colors hover:text-gray-700"
            ref={closeButtonRef}
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        {/* Sort By Section */}
        <div
          className="relative border-t border-gray-200 pt-6"
          ref={sortDropdownRef}
        >
          <label
            id="sort-label"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Sort by
          </label>
          <div className="relative">
            <button
              type="button"
              id="sort-dropdown-button"
              aria-haspopup="listbox"
              aria-expanded={isSortDropdownOpen}
              aria-labelledby="sort-label sort-dropdown-button"
              className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-300 bg-white py-2 pl-4 pr-10 text-gray-800 transition-all duration-200 focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
            >
              <span>
                {sortOptions.find((opt) => opt.value === localSortValue)
                  ?.label || "Sort"}
              </span>
              <svg
                className={clsx(
                  "h-5 w-5 text-gray-500 transition-transform duration-200",
                  { "rotate-180": isSortDropdownOpen },
                )}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isSortDropdownOpen && (
              <ul
                role="listbox"
                aria-labelledby="sort-label"
                tabIndex={-1}
                className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg focus:outline-none"
              >
                {sortOptions
                  .filter((opt) => opt.value !== "")
                  .map((opt) => (
                    <li
                      key={opt.value}
                      id={`sort-option-${opt.value}`}
                      role="option"
                      aria-selected={opt.value === localSortValue}
                      onClick={() => {
                        setLocalSortValue(opt.value);
                        setIsSortDropdownOpen(false);
                      }}
                      className={clsx(
                        "cursor-pointer px-4 py-2 text-sm text-gray-900",
                        "hover:bg-gray-100 hover:text-gray-900",
                        "focus:bg-gray-100 focus:outline-none",
                        {
                          "bg-[var(--color-accent)]/10 font-semibold text-[var(--color-accent)]":
                            opt.value === localSortValue,
                        },
                      )}
                      tabIndex={0}
                    >
                      {opt.label}
                      {opt.value === localSortValue}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        {/* Price Range Section */}
        <div className="border-t border-gray-200 pt-6">
          <label className="block text-sm font-medium text-gray-700">
            Price range
          </label>
          <p className="mb-4 mt-1 text-xs text-gray-500">
            Trip price, includes all fees.
          </p>

          <div className="relative mb-4 h-10 w-full">
            <div className="absolute inset-0 flex items-end justify-between px-1">
              {priceDistribution.map((b, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-t-sm bg-gray-400"
                  style={{ height: `${(b.count / (maxCount || 1)) * 100}%` }}
                />
              ))}
            </div>
          </div>
          <div className="relative mb-4 h-10 w-full">
            <Rheostat
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              values={[localMinPrice, localMaxPrice]}
              onValuesUpdated={({ values }: PublicState) => {
                setLocalMinPrice(values[0]);
                setLocalMaxPrice(values[1]);
              }}
              handle={Handle}
              progressBar={Progress}
              background={Background}
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex-1">
              <label
                htmlFor="min-price"
                className="mb-1 block text-xs font-medium text-gray-500"
              >
                Minimum
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-900">
                  R
                </span>
                <input
                  type="text"
                  id="min-price"
                  value={localMinPrice.toLocaleString()}
                  onChange={handleMinPriceChange}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 font-medium text-gray-900 focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
            <div className="mt-6 font-semibold text-gray-400">–</div>
            <div className="flex-1">
              <label
                htmlFor="max-price"
                className="mb-1 block text-xs font-medium text-gray-500"
              >
                Maximum
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-900">
                  R
                </span>
                <input
                  type="text"
                  id="max-price"
                  value={localMaxPrice.toLocaleString()}
                  onChange={handleMaxPriceChange}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 font-medium text-gray-900 focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex justify-between border-t border-gray-200 pt-6">
          <button
            type="button"
            className="rounded-lg px-5 py-2 font-semibold text-gray-700 transition-colors hover:bg-gray-100"
            onClick={handleClearClick}
          >
            Clear all
          </button>
          <button
            type="button"
            className="hover:bg-[var(--color-accent)]/90 rounded-lg bg-[var(--color-accent)] px-6 py-2 font-semibold text-white shadow-md transition-colors"
            onClick={handleApplyClick}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
