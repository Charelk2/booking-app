"use client";

import { useState, useEffect, useCallback } from "react";
import "rheostat/initialize";
import "rheostat/css/rheostat.css";
import Rheostat from "rheostat";
import type { PublicState } from "rheostat";
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
  onApply: (f: { minPrice: number; maxPrice: number; sort: string }) => void;
  onClear: () => void;
  onClose: () => void;

  sortOptions: SortOption[];
  initialSort?: string;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function digitsOnly(s: string) {
  return s.replace(/\D+/g, "");
}
function parseNum(s: string): number | null {
  const d = digitsOnly(s);
  if (!d) return null;
  const n = parseInt(d, 10);
  return Number.isFinite(n) ? n : null;
}
function formatZA(n: number) {
  return n.toLocaleString("en-ZA");
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
}: PriceFilterProps) {
  // ────────────────────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────────────────────
  const [localMinPrice, setLocalMinPrice] = useState(initialMinPrice);
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);

  // Draft text states (so typing doesn’t fight you)
  const [minDraft, setMinDraft] = useState(formatZA(initialMinPrice));
  const [maxDraft, setMaxDraft] = useState(formatZA(initialMaxPrice));
  const [editingMin, setEditingMin] = useState(false);
  const [editingMax, setEditingMax] = useState(false);

  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  const [localSortValue, setLocalSortValue] = useState(initialSort || "");

  // Re-init when opened or initial values change
  useEffect(() => {
    if (open) {
      setLocalMinPrice(initialMinPrice);
      setLocalMaxPrice(initialMaxPrice);
      setMinDraft(formatZA(initialMinPrice));
      setMaxDraft(formatZA(initialMaxPrice));
      setEditingMin(false);
      setEditingMax(false);
      setLocalSortValue(initialSort || "");
      setActiveHandle(null);
    }
  }, [open, initialMinPrice, initialMaxPrice, initialSort]);

  const maxCount = priceDistribution.reduce((m, b) => Math.max(m, b.count), 0);

  const handleApplyClick = useCallback(() => {
    onApply({
      minPrice: localMinPrice,
      maxPrice: localMaxPrice,
      sort: localSortValue,
    });
    onClose();
  }, [localMinPrice, localMaxPrice, localSortValue, onApply, onClose]);

  const handleClearClick = useCallback(() => {
    setLocalMinPrice(SLIDER_MIN);
    setLocalMaxPrice(SLIDER_MAX);
    setMinDraft(formatZA(SLIDER_MIN));
    setMaxDraft(formatZA(SLIDER_MAX));
    setEditingMin(false);
    setEditingMax(false);

    setLocalSortValue("");
    onClear();
    onClose();
  }, [onClear, onClose]);

  // ────────────────────────────────────────────────────────────────────────────
  // Draft input helpers (commit on blur/Enter only)
  // ────────────────────────────────────────────────────────────────────────────
  const commitMin = useCallback(() => {
    setEditingMin(false);
    const parsed = parseNum(minDraft);
    const next = parsed == null ? SLIDER_MIN : clamp(parsed, SLIDER_MIN, SLIDER_MAX);
    // Only after commit, ensure min <= max
    if (next > localMaxPrice) setLocalMaxPrice(next);
    setLocalMinPrice(next);
    setMinDraft(formatZA(next));
  }, [minDraft, localMaxPrice]);

  const commitMax = useCallback(() => {
    setEditingMax(false);
    const parsed = parseNum(maxDraft);
    const next = parsed == null ? SLIDER_MAX : clamp(parsed, SLIDER_MIN, SLIDER_MAX);
    // Only after commit, ensure max >= min
    if (next < localMinPrice) setLocalMinPrice(next);
    setLocalMaxPrice(next);
    setMaxDraft(formatZA(next));
  }, [maxDraft, localMinPrice]);

  const onMinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitMin();
    }
  };
  const onMaxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitMax();
    }
  };

  // Inputs (no clamping while typing)
  const handleMinPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingMin(true);
    setMinDraft(digitsOnly(e.target.value));
  }, []);
  const handleMaxPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingMax(true);
    setMaxDraft(digitsOnly(e.target.value));
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // Rheostat: big tap targets + touch fixes
  // ────────────────────────────────────────────────────────────────────────────
  type HandleProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    "data-handle-key": string;
    handleRef?: (el: HTMLButtonElement | null) => void; // provided by Rheostat
  };

  const Handle = (props: HandleProps) => {
    const { handleRef, ...rest } = props; // keep handleRef off DOM
    const idx = Number(rest["data-handle-key"]);

    return (
      <button
        ref={handleRef}
        type="button"
        aria-label={idx === 0 ? "Minimum price handle" : "Maximum price handle"}
        {...rest}
        onMouseDown={(e) => {
          setActiveHandle(idx);
          rest.onMouseDown?.(e);
        }}
        onTouchStart={(e) => {
          // Don’t let parents steal the gesture
          e.stopPropagation();
          setActiveHandle(idx);
          rest.onTouchStart?.(e);
        }}
        onBlur={(e) => {
          setActiveHandle(null);
          rest.onBlur?.(e);
        }}
        // 44x44 + halo for easy tapping; prevent scroll-from-drag on mobile
        className={clsx(
          "absolute -top-3 h-7 w-7 -translate-x-1/2 rounded-full border-2 border-gray-300 bg-white shadow",
          "before:content-[''] before:absolute before:-inset-3 before:rounded-full before:bg-transparent",
          "focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
          "active:scale-105 touch-none select-none",
          rest.className,
          { "ring-[var(--color-accent)]/40 ring-4": activeHandle === idx },
        )}
        style={{
          ...rest.style,
          marginLeft: 0,
          zIndex:
            activeHandle === idx
              ? 50
              : idx === 0
              ? localMinPrice === localMaxPrice
                ? 40
                : 20
              : 30,
          touchAction: "none",
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

  // Prevent sheet/scroll containers from hijacking touch
  const stopTouchBubble = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────
  if (!open) return null;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Header */}
      <div className="px-4 pb-3 pt-3">
        <div
          aria-hidden="true"
          className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-200 md:hidden"
        />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-6">
          {/* Sort */}
          <div>
            <label htmlFor="sheet-sort" className="mb-2 block text-sm font-medium text-gray-700">
              Sort by
            </label>
            <div className="relative">
              <select
                id="sheet-sort"
                value={localSortValue}
                onChange={(e) => setLocalSortValue(e.target.value)}
                className="block w-full appearance-none rounded-xl border border-gray-300 bg-white py-2.5 pl-4 pr-10 text-sm text-gray-900 shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value || "best_match"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
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
            </div>
          </div>

          {/* Price Range */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-700">Price range</label>
              <div className="text-sm font-semibold text-gray-900 tabular-nums">
                R{formatZA(localMinPrice)} – R{formatZA(localMaxPrice)}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">Trip price, includes all fees.</p>

            {/* Histogram */}
            <div className="relative mt-4 h-10 w-full px-3">
              <div className="absolute inset-0 flex items-end justify-between">
                {priceDistribution.map((b, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-t-sm bg-gray-300"
                    style={{ height: `${(b.count / (maxCount || 1)) * 100}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Slider */}
            <div
              className="relative mt-3 h-10 w-full select-none px-3"
              onTouchStart={stopTouchBubble}
              onTouchMove={stopTouchBubble}
              onTouchEnd={stopTouchBubble}
            >
              <Rheostat
                className="touch-none"
                min={SLIDER_MIN}
                max={SLIDER_MAX}
                values={[localMinPrice, localMaxPrice]}
                onValuesUpdated={({ values }: PublicState) => {
                  // live while dragging
                  setLocalMinPrice(values[0]);
                  setLocalMaxPrice(values[1]);
                  // keep drafts in sync when NOT editing
                  if (!editingMin) setMinDraft(formatZA(values[0]));
                  if (!editingMax) setMaxDraft(formatZA(values[1]));
                }}
                handle={Handle}
                progressBar={Progress}
                background={Background}
              />
            </div>

            {/* Inputs */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="min-price" className="mb-1 block text-xs font-medium text-gray-500">
                  Minimum
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-900">
                    R
                  </span>
                  <input
                    type="text"
                    id="min-price"
                    inputMode="numeric"
                    value={editingMin ? minDraft : formatZA(localMinPrice)}
                    onChange={handleMinPriceChange}
                    onFocus={() => {
                      setEditingMin(true);
                      setMinDraft(digitsOnly(String(localMinPrice)));
                    }}
                    onBlur={commitMin}
                    onKeyDown={onMinKeyDown}
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white py-2 pl-8 pr-3 font-medium text-gray-900 shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="max-price" className="mb-1 block text-xs font-medium text-gray-500">
                  Maximum
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-900">
                    R
                  </span>
                  <input
                    type="text"
                    id="max-price"
                    inputMode="numeric"
                    value={editingMax ? maxDraft : formatZA(localMaxPrice)}
                    onChange={handleMaxPriceChange}
                    onFocus={() => {
                      setEditingMax(true);
                      setMaxDraft(digitsOnly(String(localMaxPrice)));
                    }}
                    onBlur={commitMax}
                    onKeyDown={onMaxKeyDown}
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white py-2 pl-8 pr-3 font-medium text-gray-900 shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            onClick={handleClearClick}
          >
            Clear all
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-black/90"
            onClick={handleApplyClick}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
