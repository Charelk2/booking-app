// src/components/search/SearchFields.tsx
'use client';

import {
  forwardRef,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import clsx from 'clsx';
import LocationInput, { PlaceResult } from '../ui/LocationInput';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

// Import types for consistency
import type { ActivePopup, Category, SearchFieldId } from './types';

// Re-export types so external imports from './SearchFields' keep working
export type { Category, SearchFieldId } from './types';


export interface SearchFieldsProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  activeField: ActivePopup;
  onFieldClick: (fieldId: SearchFieldId, element: HTMLElement) => void;
  compact?: boolean;
  // Ref forwarded to the internal location input so parent components can focus it
  // The ref's `current` will be `null` initially but will point to the input element once mounted
  locationInputRef: MutableRefObject<HTMLInputElement | null>;
  /**
   * Callback fired whenever the Google Places autocomplete predictions update.
   * Made optional so callers that do not need prediction data do not have to provide a handler.
   * Typed as a React state dispatcher so callers can directly pass a `useState` setter.
   */
  onPredictionsChange?: Dispatch<SetStateAction<google.maps.places.AutocompletePrediction[]>>;
  classNameOverrides?: {
    fieldBase?: string;
    divider?: string;
  };
  submitBusy?: boolean;
  showExpanded?: boolean;
  /** Restrict Where autocomplete to city/town in SearchBar only */
  locationCityOnly?: boolean;
}

export const SearchFields = forwardRef<HTMLDivElement, SearchFieldsProps>(
  (
    {
      category,
      setCategory,
      location,
      setLocation,
      when,
      setWhen,
      activeField,
      onFieldClick,
      compact = false,
      locationInputRef,
      onPredictionsChange,
      submitBusy = false,
      showExpanded = false,
      locationCityOnly = false,
    },
    ref
  ) => {
    // Individual refs for each field's element to store and return focus
    const categoryButtonRef = useRef<HTMLButtonElement>(null);
    const whenButtonRef = useRef<HTMLButtonElement>(null);
    const locationContainerRef = useRef<HTMLDivElement>(null);

    // Helper to render a generic search field button
    const renderField = (
      id: SearchFieldId,
      label: string,
      currentValue: string | JSX.Element,
      buttonRef: React.RefObject<HTMLButtonElement>,
      onClear: () => void, // Function to clear the specific field
      additionalClasses?: string // Add an optional parameter for custom classes
    ) => {
      const isActive = activeField === id;
      // Adjusted isValuePresent logic for clarity and consistency across all placeholders
      const isValuePresent =
        typeof currentValue === 'string' &&
        currentValue !== '' &&
        !['Search', 'Add service', 'Add dates', 'Add location'].includes(currentValue);

      const textSizeClass = isValuePresent
        ? (compact ? 'text-sm' : 'text-base')
        : 'text-xs';

      return (
        <div className="relative flex-1 min-w-0">
          {/* min-w-0 ensures flex children can shrink and truncate long values */}
          <button
            ref={buttonRef} // Attach ref to the button element
            type="button"
            onClick={() => onFieldClick(id, buttonRef.current!)} // Pass the ID and the button element
            className={clsx(
              'group relative text-sm z-10 w-full flex flex-col rounded-full justify-center text-left transition-all duration-200 ease-out outline-none focus:outline-none focus:ring-0 focus:ring-offset-0',
              compact ? 'px-4 py-2' : 'px-6 py-2',
              isActive
                ? 'bg-gray-100 rounded-full'
                : 'hover:bg-gray-100 focus:bg-gray-50', // Removed rounded-full here
              additionalClasses // Apply any additional classes passed in
            )}
            aria-expanded={isActive}
            aria-controls={`${id}-popup`}
            id={`${id}-search-button`} // Provide a unique ID for aria-controls
          >
            <span
              className={clsx(
                'flex items-center text-xs font-semibold tracking-wide pointer-events-none select-none',
                isValuePresent ? 'text-slate-900' : 'text-slate-600',
              )}
            >
              {label}
            </span>
            <span
              className={clsx(
                'block truncate pointer-events-none select-none',
                isValuePresent ? 'text-gray-800' : 'text-gray-600',
                textSizeClass
              )}
            >
              {currentValue}
            </span>
          </button>

          {/* Clear button - only visible when a value is present AND the field IS active */}
          {isValuePresent && isActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // Prevent opening the popup
                onClear(); // Clear the specific field
                if (buttonRef.current) {
                  buttonRef.current.focus(); // Return focus to the button
                }
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none rounded-full p-1 z-20 transition-transform active:scale-90"
              aria-label={`Clear ${label}`}
              title={`Clear ${label}`}
            >
              &times;
            </button>
          )}
        </div>
      );
    };

    // Use a stable date formatter for consistent output across server/client
    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const locationTextSizeClass = location
      ? (compact ? 'text-sm' : 'text-base')
      : 'text-xs';

  return (
    <div ref={ref} className="flex flex-1 divide-x divide-gray-50 rounded-2xl">
      {renderField(
        'category',
        'Category',
        category ? category.label : 'Add service',
        categoryButtonRef,
        () => setCategory(null),
        'hover:rounded-full' // Pass rounded-full as an additional class
      )}

      <div className="border-l border-gray-100" />

      {renderField(
        'when',
        'When',
        when ? dateFormatter.format(when) : 'Add dates',
        whenButtonRef,
        () => setWhen(null)
      )}

      <div className="border-l rounded-full border-white-200" />

      {/* Location field now uses a direct input instead of a button */}
      <div
        ref={locationContainerRef}
        className={clsx(
          'relative min-w-0 transition-all duration-200 ease-out', 
          compact ? 'px-4 py-2' : 'px-6 py-2',
          // Make room for the inline submit button on the right (slightly tighter)
          'pr-16',
          activeField === 'location'
            ? 'bg-gray-100 rounded-full '
            : 'rounded-full hover:bg-gray-100 focus:bg-gray-50 ',
        )}
        onFocus={() => onFieldClick('location', locationContainerRef.current!)}
        onClick={() => locationInputRef.current?.focus()}
      >
        <span
          className={clsx(
            'flex items-center text-xs font-semibold tracking-wide pointer-events-none select-none',
            location ? 'text-slate-900' : 'text-slate-600',
          )}
        >
          Where
        </span>
        <LocationInput
          ref={locationInputRef}
          value={location}
          onValueChange={setLocation}
          onPlaceSelect={(place: PlaceResult) => {
            if (locationCityOnly) {
              // LocationInput already set the display value via onValueChange; don't override it here
              return;
            }
            setLocation(place.formatted_address || place.name || '');
          }}
          placeholder="Add location"
          className="w-full"
          inputClassName={clsx(
            'block truncate p-0 bg-transparent placeholder:text-gray-600',
            location ? 'text-gray-800' : 'text-gray-600',
            locationTextSizeClass,
            // Avoid text under the submit button (slightly tighter)
            'pr-6',
          )}
          showDropdown={false}
          onPredictionsChange={onPredictionsChange}
          cityOnly={locationCityOnly}
        />

        {/* No clear (x) button for Where in SearchBar context */}

        {/* Inline submit button inside the Where field */}
        <button
          type="submit"
          aria-label="Search now"
          aria-expanded={!!activeField}
          className={clsx(
            'absolute right-3 top-1/2 -translate-y-1/2 h-10 rounded-full flex items-center',
            !!activeField || showExpanded ? 'px-3 gap-2 w-auto justify-center' : 'w-10 justify-center',
            'bg-white/70 hover:bg-gray-100',
            'border border-white/60 ring-1 ring-white/40 backdrop-blur-md',
            'transition-all duration-200',
            submitBusy && 'cursor-not-allowed opacity-80',
          )}
          disabled={submitBusy}
        >
          {submitBusy ? (
            <svg className="h-5 w-5 animate-spin text-slate-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <>
              <MagnifyingGlassIcon className="h-5 w-5 text-slate-900/80" />
              {(!!activeField || showExpanded) && (
                <span className="text-xs font-semibold text-slate-900/90">Search</span>
              )}
            </>
          )}
          <span className="sr-only">Search</span>
        </button>
      </div>
    </div>
  );
}
);

// Explicitly set display name to satisfy React and ESLint rules
SearchFields.displayName = 'SearchFields';
