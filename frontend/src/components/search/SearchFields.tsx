// src/components/search/SearchFields.tsx
'use client';

import { forwardRef, useRef } from 'react';
import clsx from 'clsx';
import { getStreetFromAddress } from '@/lib/utils';

// Import types for consistency
import type { ActivePopup } from './SearchBar'; // Assuming SearchBar defines ActivePopup
import { Category as CategoryType } from '@/lib/categoryMap'; // Correctly import Category from categoryMap.ts

// Re-exporting for external use, if needed
export type Category = CategoryType;
export type SearchFieldId = 'location' | 'when' | 'category';


export interface SearchFieldsProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  activeField: ActivePopup;
  onFieldClick: (fieldId: SearchFieldId, buttonElement: HTMLButtonElement) => void;
  compact?: boolean;
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
    },
    ref
  ) => {
    // Individual refs for each field's button element to store and return focus
    const categoryButtonRef = useRef<HTMLButtonElement>(null);
    const locationButtonRef = useRef<HTMLButtonElement>(null);
    const whenButtonRef = useRef<HTMLButtonElement>(null);

    // Helper to render a generic search field button
    const renderField = (
      id: SearchFieldId,
      label: string,
      currentValue: string | JSX.Element,
      buttonRef: React.RefObject<HTMLButtonElement>,
      onClear: () => void // Function to clear the specific field
    ) => {
      const isActive = activeField === id;
      // Adjusted isValuePresent logic for clarity and consistency across all placeholders
      const isValuePresent =
        typeof currentValue === 'string' &&
        currentValue !== '' &&
        !['Add dates', 'Add artist', 'Add location'].includes(currentValue);

      return (
        <div className="relative flex-1 min-w-0">
          {/* min-w-0 ensures flex children can shrink and truncate long values */}
          <button
            ref={buttonRef} // Attach ref to the button element
            type="button"
            onClick={() => onFieldClick(id, buttonRef.current!)} // Pass the ID and the button element
            className={clsx(
              'group relative z-10 w-full flex flex-col justify-center text-left transition-all duration-200 ease-out outline-none',
              compact ? 'px-4 py-2' : 'px-6 py-3',
              isActive
                ? 'bg-gray-100 shadow-md'
                : 'hover:bg-gray-50 focus:bg-gray-50'
            )}
            aria-expanded={isActive}
            aria-controls={`${id}-popup`}
            id={`${id}-search-button`} // Provide a unique ID for aria-controls
          >
            <span className="text-sm text-gray-700 font-semibold  pointer-events-none select-none">{label}</span>
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
    <div ref={ref} className="flex flex-1 divide-x divide-gray-200">
      {renderField(
        'location',
        'Where',
          (compact && location ? getStreetFromAddress(location) : location) || 'Add location',
          locationButtonRef,
          () => setLocation('')
        )}

        <div className="border-l border-gray-200" />

        {renderField(
          'when',
          'When',
          when ? dateFormatter.format(when) : 'Add dates',
          whenButtonRef,
          () => setWhen(null)
        )}

        <div className="border-l border-gray-200" />

        {renderField(
          'category',
          'Category',
          category ? category.label : 'Add artist',
          categoryButtonRef,
          () => setCategory(null)
      )}
    </div>
  );
}
);

// Explicitly set display name to satisfy React and ESLint rules
SearchFields.displayName = 'SearchFields';
