import { useEffect, useRef, useState } from 'react';
import LocationMapModal from './LocationMapModal';
import clsx from 'clsx';

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function LocationInput({
  value,
  onChange,
  placeholder = 'Location',
  className,
}: LocationInputProps) {
  const autoRef = useRef<Element | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleClose = () => {
    setModalOpen(false);
    (autoRef.current as HTMLElement | null)?.blur();
  };

  useEffect(() => {
    const el = autoRef.current as HTMLElement | null;
    if (!el) return;
    function handleChange(e: Event) {
      const place = (e as any).detail?.place;
      if (place?.formatted_address) onChange(place.formatted_address);
    }
    el.addEventListener('placechange', handleChange);
    el.addEventListener('gmpx-placechange', handleChange);
    return () => {
      el.removeEventListener('placechange', handleChange);
      el.removeEventListener('gmpx-placechange', handleChange);
    };
  }, [onChange]);

  useEffect(() => {
    if (autoRef.current) {
      // @ts-ignore - value is writable on the web component
      (autoRef.current as any).value = value;
    }
  }, [value]);

  return (
    <>
      <div className="relative">
        <gmpx-place-autocomplete ref={autoRef} data-testid="location-input">
          <input
            slot="input"
            type="text"
            placeholder={placeholder}
            className={clsx(
              className,
              'pr-8 block w-full rounded-md border border-gray-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm',
            )}
          />
        </gmpx-place-autocomplete>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="absolute inset-y-0 right-1 flex items-center text-gray-500 hover:text-gray-700 text-sm"
          data-testid="open-map-modal"
        >
          Map
        </button>
      </div>
      <LocationMapModal
        open={modalOpen}
        onClose={handleClose}
        value={value}
        onSelect={(addr) => {
          onChange(addr);
          handleClose();
        }}
      />
    </>
  );
}
