'use client';

import { useState, useRef, useEffect, useCallback, FormEvent, Fragment } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Transition } from '@headlessui/react';
import dynamic from 'next/dynamic';
import { SearchFields, type SearchFieldId } from './SearchFields';
import type { ActivePopup } from './SearchBar';

interface Props {
  open: boolean;
  onClose: () => void;
  initialLocation?: string;
  initialWhen?: Date | null;
  initialGuests?: number | null;
  onSearch: (params: { location?: string; when?: Date | null; guests?: number | null }) => void | Promise<void>;
}

const DynamicSearchPopupContent = dynamic(() => import('./SearchPopupContent'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading search options...</div>,
});

export default function SearchBarExpanded({
  open,
  onClose,
  initialLocation,
  initialWhen,
  initialGuests,
  onSearch,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<ActivePopup>(null);
  const [showPopup, setShowPopup] = useState(false);

  const [location, setLocation] = useState(initialLocation || '');
  const [when, setWhen] = useState<Date | null>(initialWhen || null);
  const [guests, setGuests] = useState<number | null>(initialGuests || null);

  const lastActiveButtonRef = useRef<HTMLButtonElement | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const guestsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLocation(initialLocation || '');
      setWhen(initialWhen || null);
      setGuests(initialGuests || null);
      setActiveField('location');
      setShowPopup(true);
    } else {
      setShowPopup(false);
    }
  }, [open, initialLocation, initialWhen, initialGuests]);

  const handleFieldClick = useCallback((fieldId: SearchFieldId, buttonElement: HTMLButtonElement) => {
    setActiveField(fieldId);
    setShowPopup(true);
    lastActiveButtonRef.current = buttonElement;
  }, []);

  const closeAllPopups = useCallback(() => {
    setShowPopup(false);
    setTimeout(() => {
      setActiveField(null);
      if (lastActiveButtonRef.current) {
        lastActiveButtonRef.current.focus();
        lastActiveButtonRef.current = null;
      }
    }, 200);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    closeAllPopups();
    try {
      await onSearch({ location: location || undefined, when, guests });
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  const popupPositionAndSizeClasses = clsx(
    { 'min-w-[300px]': true },
    { 'left-0 right-auto': activeField === 'location', 'w-full sm:w-[480px]': activeField === 'location' },
    { 'left-1/2 -translate-x-1/2 right-auto': activeField === 'when', 'w-fit min-w-[400px] max-w-[600px]': activeField === 'when' },
    { 'right-1 left-auto': activeField === 'guests', 'w-[260px] max-h-[200px] overflow-hidden': activeField === 'guests' }
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="search-expanded-overlay"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="relative bg-white w-full h-full p-4 sm:h-auto sm:max-w-xl sm:rounded-xl overflow-auto">
        <button
          type="button"
          aria-label="Close search"
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          onClick={onClose}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        {showPopup && (
          <div
            className="absolute inset-0 bg-black/20 z-10" // overlay within modal for popups
            aria-hidden="true"
            onClick={closeAllPopups}
          />
        )}

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          autoComplete="off"
          className="relative z-20 flex items-stretch bg-white rounded-full shadow-md"
        >
          <SearchFields
            mode="guests"
            location={location}
            setLocation={setLocation}
            when={when}
            setWhen={setWhen}
            guests={guests}
            setGuests={setGuests}
            activeField={activeField}
            onFieldClick={handleFieldClick}
          />
          <button
            type="submit"
            className={clsx(
              'bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 px-5 py-3 flex items-center justify-center text-white rounded-r-full transition-all duration-200 ease-out',
              isSubmitting && 'opacity-70 cursor-not-allowed',
              !isSubmitting && 'active:scale-95'
            )}
            aria-label="Search now"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <MagnifyingGlassIcon className="h-5 w-5" />
            )}
            <span className="sr-only">Search</span>
          </button>

          <Transition
            show={showPopup}
            as={Fragment}
            key={activeField ?? 'none'}
            enter="transition ease-out duration-100"
            enterFrom="opacity-0 -translate-y-2"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-75"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 -translate-y-2"
          >
            <div
              className={clsx(
                'absolute top-full mt-2 rounded-xl bg-white p-4 shadow-xl ring-1 ring-black ring-opacity-5 z-30',
                popupPositionAndSizeClasses
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby={activeField ? `search-popup-label-${activeField}` : undefined}
            >
              {showPopup && (
                <DynamicSearchPopupContent
                  activeField={activeField}
                  location={location}
                  setLocation={setLocation}
                  when={when}
                  setWhen={setWhen}
                  guests={guests}
                  setGuests={setGuests}
                  closeAllPopups={closeAllPopups}
                  locationInputRef={locationInputRef}
                  guestsInputRef={guestsInputRef}
                />
              )}
            </div>
          </Transition>
        </form>
      </div>
    </div>
  );
}
