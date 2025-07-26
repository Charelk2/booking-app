'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface CustomLocationInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export default function CustomLocationInput({
  value,
  onValueChange,
  onPlaceSelect,
  placeholder = 'Search location',
  className,
  inputClassName,
}: CustomLocationInputProps) {
  const autoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = autoRef.current as HTMLElement | null;
    if (!el) return;

    function handleChange(e: Event) {
      const place = (e as any).detail?.place;
      if (place) {
        onPlaceSelect(place);
        onValueChange(place.formatted_address || value);
      }
    }

    el.addEventListener('placechange', handleChange);
    el.addEventListener('gmpx-placechange', handleChange);
    return () => {
      el.removeEventListener('placechange', handleChange);
      el.removeEventListener('gmpx-placechange', handleChange);
    };
  }, [onPlaceSelect, onValueChange, value]);

  useEffect(() => {
    if (autoRef.current) {
      // @ts-ignore - value is writable on the web component
      (autoRef.current as any).value = value ?? '';
    }
  }, [value]);

  return (
    <gmpx-place-autocomplete ref={autoRef} className={clsx('block w-full', className)}>
      <input
        slot="input"
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none',
          inputClassName,
        )}
      />
    </gmpx-place-autocomplete>
  );
}
