// components/search/SearchBar.tsx
'use client';

import { useRef, useState, KeyboardEvent, FormEvent, useCallback, Fragment } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { SearchFields, type Category, type SearchFieldId } from './SearchFields';
import useClickOutside from '@/hooks/useClickOutside';
import { Transition } from '@headlessui/react';
import dynamic from 'next/dynamic';


export type ActivePopup = SearchFieldId | null;

export interface SearchBarProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
  onCancel?: () => void; // This prop is called when its internal popups are closed
  compact?: boolean; // This should always be 'false' when used in the Header for the 'full' search bar
}

// Ensure DynamicSearchPopupContent exists at this path
const DynamicSearchPopupContent = dynamic(() => import('./SearchPopupContent'), {
  ssr: false,
  loading: () => <div className="p-4 text-center text-gray-500">Loading search options...</div>,
});

export default function SearchBar({
  category,
  setCategory,
  location,
  setLocation,
  when,
  setWhen,
  onSearch,
  onCancel,
  compact = false,
}: SearchBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<ActivePopup>(null);
  const [showPopup, setShowPopup] = useState(false); // Controls internal popups (category, date, etc.)

  const lastActiveButtonRef = useRef<HTMLButtonElement | null>(null);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const categoryListboxOptionsRef = useRef<HTMLUListElement>(null);


  const handleFieldClick = useCallback((fieldId: SearchFieldId, buttonElement: HTMLButtonElement) => {
    setActiveField(fieldId);
    setShowPopup(true); // <--- This is the key to showing the popup
    lastActiveButtonRef.current = buttonElement;
  }, []);

  // Function to close internal popups (calendar, category list)
  const closeAllInternalPopups = useCallback(() => {
    setShowPopup(false);
    setTimeout(() => {
        setActiveField(null);
        // Important: Call onCancel to notify the parent (Header) that the internal search form's popups are closed.
        // The Header will then decide if it needs to change its state (e.g., revert from expanded-from-compact).
        if (onCancel) onCancel();
        if (lastActiveButtonRef.current) {
            (lastActiveButtonRef.current as HTMLElement).focus();
            lastActiveButtonRef.current = null;
        }
    }, 200); // Small delay to allow CSS transition
  }, [onCancel]);

  // Hook to close popups when clicking outside the SearchBar's form
  useClickOutside(formRef, () => {
      if (showPopup) { // Only attempt to close if a popup is currently open
          closeAllInternalPopups();
      }
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAllInternalPopups();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    closeAllInternalPopups(); // Close internal popups before submitting

    try {
      await onSearch({ // Call the onSearch prop passed from Header
        category: category?.value,
        location: location || undefined,
        when,
      });
    } finally {
      setSubmitting(false);
      // The onSearch callback (from Header) already contains logic to revert header state after a search
    }
  };

  // Classes for positioning and sizing the internal popups
  const popupPositionAndSizeClasses = clsx(
    {
      'min-w-[300px]': true,
    },
    {
      'left-0 right-auto': activeField === 'location',
      'w-[calc(100%+2rem)] md:w-[480px] md:min-w-[400px] max-h-[1000px] ': activeField === 'location',
    },
    {
      'left-1/2 -translate-x-1/2 right-auto': activeField === 'when',
      'w-fit min-w-[400px] max-w-[600px] max-h-fit': activeField === 'when',
    },
    {
      'right-1 left-auto': activeField === 'category',
      'w-[350px] max-h-[300px] overflow-hidden': activeField === 'category',
    }
  );

  return (
    <>
      {/* Overlay for SearchBar's internal popups (e.g., calendar/category list) */}
      {showPopup && (
        <div
          // This overlay needs to be on top of EVERYTHING else in the app (including the header's Z-40)
          className="fixed inset-0 bg-black bg-opacity-30 z-50 cursor-pointer animate-fadeIn"
          aria-hidden="true"
          onClick={closeAllInternalPopups} // This closes the internal popup
        />
      )}

      <form
        ref={formRef}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        autoComplete="off"
        className={clsx(
          // Ensure this form itself has a decent z-index to be above normal content
          'relative z-45 flex items-stretch bg-white rounded-r-full shadow-lg transition-all duration-200 ease-out', // Adjusted to z-45
          compact ? 'text-sm' : 'text-base',
          showPopup ? 'shadow-xl' : 'shadow-md hover:shadow-lg'
        )}
        role="search"
        aria-label="Artist booking search"
      >
        <SearchFields
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
          activeField={activeField}
          onFieldClick={handleFieldClick}
          compact={compact}
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
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <MagnifyingGlassIcon className="h-5 w-5" />
          )}
          <span className="sr-only">Search</span>
        </button>

        <Transition
          show={showPopup}
          as={Fragment}
          key={activeField} // Forces re-animation when the active field changes
          enter="transition ease-out duration-300"
          enterFrom="opacity-0 -translate-y-2"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 -translate-y-2"
        >
          <div
            className={clsx(
              "absolute top-full mt-2 rounded-xl bg-white p-4 shadow-xl ring-1 ring-black ring-opacity-5 z-50", // z-50 to ensure it's on top of internal overlay
              "origin-top-left",
              "hover:shadow-2xl hover:ring-[var(--color-accent)]/30",
              popupPositionAndSizeClasses
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby={activeField ? `search-popup-label-${activeField}` : undefined}
          >
            {showPopup && ( // This ensures DynamicSearchPopupContent is only mounted when needed
              <DynamicSearchPopupContent
                activeField={activeField}
                category={category}
                setCategory={setCategory}
                location={location}
                setLocation={setLocation}
                when={when}
                setWhen={setWhen}
                closeAllPopups={closeAllInternalPopups} // Pass this component's close function
                locationInputRef={locationInputRef}
                categoryListboxOptionsRef={categoryListboxOptionsRef}
              />
            )}
          </div>
        </Transition>
      </form>
    </>
  );
}