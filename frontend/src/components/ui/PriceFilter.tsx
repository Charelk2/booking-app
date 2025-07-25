'use client';

import { useState, useEffect } from 'react';
import 'rheostat/initialize';
import 'rheostat/css/rheostat.css';
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
}

export default function PriceFilter({
  open,
  initialMinPrice,
  initialMaxPrice,
  priceDistribution,
  onApply,
  onClear,
}: PriceFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localMinPrice, setLocalMinPrice] = useState(initialMinPrice);
  const [localMaxPrice, setLocalMaxPrice] = useState(initialMaxPrice);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setLocalMinPrice(initialMinPrice);
      setLocalMaxPrice(initialMaxPrice);
    }
  }, [open, initialMinPrice, initialMaxPrice]);

  const maxCount = priceDistribution.reduce((m, b) => Math.max(m, b.count), 0);

  const updateUrl = (min: number, max: number) => {
    const search = new URLSearchParams(searchParams.toString());
    if (min > SLIDER_MIN) search.set('price_min', String(min));
    else search.delete('price_min');
    if (max < SLIDER_MAX) search.set('price_max', String(max));
    else search.delete('price_max');
    router.push(`${pathname}?${search.toString()}`);
  };

  const handleApply = (min: number, max: number) => {
    onApply({ minPrice: min, maxPrice: max });
    updateUrl(min, max);
  };

  const handleClear = () => {
    setLocalMinPrice(SLIDER_MIN);
    setLocalMaxPrice(SLIDER_MAX);
    onClear();
    updateUrl(SLIDER_MIN, SLIDER_MAX);
  };

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
          'absolute -top-2 w-4 h-4 rounded-full border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-pink-500',
          props.className,
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
    <div className="absolute bottom-0 h-2 bg-pink-500 rounded" style={style} />
  );

  const Background = () => (
    <div className="absolute inset-x-0 bottom-0 h-2 bg-gray-200 rounded" />
  );

  return (
    <div className="space-y-4">
      <div className="relative h-8 w-full">
        <div className="absolute inset-0 flex items-end justify-between pointer-events-none">
          {priceDistribution.map((b, i) => (
            <div
              key={i}
              className="w-[2px] rounded-t-sm bg-gray-300"
              style={{ height: `${(b.count / (maxCount || 1)) * 100}%` }}
            />
          ))}
        </div>
        <Rheostat
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          values={[localMinPrice, localMaxPrice]}
          onValuesUpdated={({ values }: PublicState) => {
            setLocalMinPrice(values[0]);
            setLocalMaxPrice(values[1]);
          }}
          onChange={({ values }: PublicState) => {
            handleApply(values[0], values[1]);
          }}
          handle={Handle}
          progressBar={Progress}
          background={Background}
        />
      </div>
      <div className="flex justify-between">
        <button type="button" className="text-sm text-gray-600" onClick={handleClear}>
          Clear
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded bg-pink-500 text-white"
          onClick={() => handleApply(localMinPrice, localMaxPrice)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
