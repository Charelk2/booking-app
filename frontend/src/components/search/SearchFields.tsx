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
import { MusicalNoteIcon, CalendarIcon, MapPinIcon } from '@heroicons/react/24/outline';

// Import types for consistency
import type { ActivePopup } from './SearchBar'; // Assuming SearchBar defines ActivePopup
import { Category as CategoryType } from '@/hooks/useServiceCategories';

// Re-exporting for external use, if needed
export type Category = CategoryType;
export type SearchFieldId = 'category' | 'when' | 'location';


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
    },
    ref
  ) => {
    // Individual refs for each field's element to store and return focus
    const categoryButtonRef = useRef<HTMLButtonElement>(null);
    const whenButtonRef = useRef<HTMLButtonElement>(null);
    const locationContainerRef = useRef<HTMLDivElement>(null);

    const iconMap = {
      category: MusicalNoteIcon,
      when: CalendarIcon,
    } as const;

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
        !['Search', 'Add dates', 'Add location'].includes(currentValue);
      const Icon = iconMap[id];

      return (
        <div className="relative flex-1 min-w-0">
          {/* min-w-0 ensures flex children can shrink and truncate long values */}
          <button
            ref={buttonRef} // Attach ref to the button element
            type="button"
            onClick={() => onFieldClick(id, buttonRef.current!)} // Pass the ID and the button element
            className={clsx(
              'group relative z-10 w-full flex flex-col rounded-full justify-center text-left transition-all duration-200 ease-out outline-none focus:outline-none focus:ring-0 focus:ring-offset-0',
              compact ? 'px-4 py-2' : 'px-6 py-4',
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
                'flex items-center text-sm font-semibold pointer-events-none select-none',
                isValuePresent ? 'text-gray-800' : 'text-gray-700',
              )}
            >
              <Icon className="mr-1 h-4 w-4 hidden "aria-hidden="true"/>
              {label}
            </span>
            <span
              className={clsx(
                'block truncate pointer-events-none select-none',
                isValuePresent ? 'text-gray-800' : 'text-gray-500', // Uses italic for placeholders
                compact ? 'text-sm' : 'text-base text-xs'
              )}
            >
              {currentValue}
            </span>
          </button>

          {/* Clear button - only visible when a value is present AND the field is NOT active */}
          {isValuePresent && !isActive && (
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

  return (
    <div ref={ref} className="flex flex-1 divide-x divide-gray-50 rounded-full">
      {renderField(
        'category',
        'Category',
        category ? category.label : 'Search',
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
          compact ? 'px-4 py-2' : 'px-6 py-4',
          activeField === 'location'
            ? 'bg-gray-100 rounded-full '
            : 'rounded-full hover:bg-gray-100 focus:bg-gray-50 ',
        )}
        onFocus={() => onFieldClick('location', locationContainerRef.current!)}
        onClick={() => locationInputRef.current?.focus()}
      >
        <span
          className={clsx(
            'flex items-center text-sm font-semibold pointer-events-none select-none',
            location ? 'text-gray-800' : 'text-gray-700',
          )}
        >
          <MapPinIcon className="mr-1 h-4 w-4 hidden "aria-hidden="true" />
          Where
        </span>
        <LocationInput
          ref={locationInputRef}
          value={location}
          onValueChange={setLocation}
          onPlaceSelect={(place: PlaceResult) => setLocation(place.formatted_address || place.name || '')}
          placeholder="Add location"
          className="w-full"
          inputClassName={clsx(
            'block truncate p-0 bg-transparent',
            location ? 'text-gray-800' : 'text-gray-500',
            compact ? 'text-sm' : 'text-base text-xs',
          )}
          showDropdown={false}
          onPredictionsChange={onPredictionsChange}
        />

        {location && activeField !== 'location' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLocation('');
              locationInputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none rounded-full p-1 z-20 transition-transform active:scale-90"
            aria-label="Clear location"
            title="Clear location"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
);

// Explicitly set display name to satisfy React and ESLint rules
SearchFields.displayName = 'SearchFields';
