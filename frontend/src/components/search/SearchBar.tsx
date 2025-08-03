// src/components/search/SearchBar.tsx
'use client';

import {
  Fragment,
  type RefObject,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { SearchFields, type Category, type SearchFieldId } from './SearchFields';
import useClickOutside from '@/hooks/useClickOutside';
import { Transition } from '@headlessui/react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom'; // NEW: Import createPortal


export type ActivePopup = SearchFieldId | null;

export interface SearchBarProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  onSearch: (params: { category?: string; location?: string; when?: Date | null }) => void | Promise<void>;
  onCancel?: () => void; // This prop is for the Header to tell THIS SearchBar to cancel/dismiss itself
  compact?: boolean; // This should always be 'false' when used in the Header for the 'full' search bar
}

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCancel,
  compact = false,
}: SearchBarProps) {
  const formRef = useRef<HTMLFormElement>(null); // Ref for the whole SearchBar form
  const [isSubmitting, setSubmitting] = useState(false);
  const [activeField, setActiveField] = useState<ActivePopup>(null);
  const [showInternalPopup, setShowInternalPopup] = useState(false);

  // NEW: State to store the position of the clicked field and width of the search bar
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; width: number; } | null>(null);

  const lastActiveButtonRef = useRef<HTMLButtonElement | null>(null);

  const locationInputRef = useRef<HTMLInputElement>(null);
  const categoryListboxOptionsRef = useRef<HTMLUListElement>(null);
  const popupContainerRef = useRef<HTMLDivElement>(null);

  // UseLayoutEffect to calculate position before browser paints
  useLayoutEffect(() => {
    if (showInternalPopup && lastActiveButtonRef.current && formRef.current) {
      const buttonRect = lastActiveButtonRef.current.getBoundingClientRect(); // Get coords of clicked button
      const formRect = formRef.current.getBoundingClientRect(); // Get coords of the whole search bar form

      // Calculate position relative to the viewport
      setPopupPosition({
        top: buttonRect.bottom + window.scrollY + 8, // 8px margin below button
        left: buttonRect.left + window.scrollX,
        width: formRect.width // Make popup same width as the entire search bar form
      });
    } else {
      setPopupPosition(null); // Clear position when popup is not visible
    }
  }, [showInternalPopup, activeField]); // Recalculate if popup state or active field changes

  const handleFieldClick = useCallback((fieldId: SearchFieldId, buttonElement: HTMLButtonElement) => {
    setActiveField(fieldId);
    setShowInternalPopup(true);
    lastActiveButtonRef.current = buttonElement;
    // Position calculated in useLayoutEffect
  }, []);

  const closeThisSearchBarsInternalPopups = useCallback(() => {
    setShowInternalPopup(false);
    setTimeout(() => {
        setActiveField(null);
        if (lastActiveButtonRef.current) {
            (lastActiveButtonRef.current as HTMLElement).focus();
            lastActiveButtonRef.current = null;
        }
    }, 200);
  }, []);

  // Close popups when clicking outside the search form or its floating content
  useClickOutside(
    [
      formRef as RefObject<HTMLElement | null>,
      popupContainerRef as RefObject<HTMLElement | null>,
    ],
    () => {
      if (showInternalPopup) {
        closeThisSearchBarsInternalPopups();
      }
    },
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeThisSearchBarsInternalPopups();
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    closeThisSearchBarsInternalPopups();

    try {
      await onSearch({
        category: category?.value,
        location: location || undefined,
        when,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <form
        ref={formRef}
        onKeyDown={handleKeyDown}
        onSubmit={handleSubmit}
        autoComplete="off"
        className={clsx(
          'relative z-45 flex items-stretch bg-white rounded-r-full shadow-lg transition-all duration-200 ease-out',
          compact ? 'text-sm' : 'text-base',
          showInternalPopup ? 'shadow-xl' : 'shadow-md hover:shadow-lg'
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
      </form>

      {/* NEW: Render the internal popup content using a portal */}
      {showInternalPopup && popupPosition && createPortal(
        <>
          {/* Overlay for SearchBar's internal popups (dims the page area around the popup) */}
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-46 cursor-pointer animate-fadeIn"
            aria-hidden="true"
            onClick={closeThisSearchBarsInternalPopups}
          />

          <Transition
            show={showInternalPopup}
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
              ref={popupContainerRef}
              className={clsx(
                "absolute rounded-xl bg-white p-4 shadow-xl ring-1 ring-black ring-opacity-5 z-47",
                "origin-top-left"
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby={activeField ? `search-popup-label-${activeField}` : undefined}
              style={{
                top: popupPosition.top,
                left: popupPosition.left,
                width: popupPosition.width, // Popup width matches the SearchBar's form width
              }}
            >
              {activeField && ( // Ensure activeField is set before rendering content
                <DynamicSearchPopupContent
                  activeField={activeField}
                  category={category}
                  setCategory={setCategory}
                  location={location}
                  setLocation={setLocation}
                  when={when}
                  setWhen={setWhen}
                  closeAllPopups={closeThisSearchBarsInternalPopups}
                  locationInputRef={locationInputRef}
                  categoryListboxOptionsRef={categoryListboxOptionsRef}
                />
              )}
            </div>
          </Transition>
        </>,
        document.body // Render into document.body
      )}
    </>
  );
}