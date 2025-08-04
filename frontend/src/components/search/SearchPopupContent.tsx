// src/components/search/SearchPopupContent.tsx
'use client';

import React, { useEffect, useState, RefObject, useCallback } from 'react';
import ReactDatePicker from 'react-datepicker';
import { Listbox } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { UI_CATEGORIES } from '@/lib/categoryMap';

import type { ActivePopup } from './SearchBar';
import type { Category } from './SearchFields';

interface SearchPopupContentProps {
  activeField: ActivePopup;
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  closeAllPopups: () => void; // Function to close these internal popups
  locationInputRef: RefObject<HTMLInputElement>;
  categoryListboxOptionsRef: RefObject<HTMLUListElement>;
}

type CustomHeaderProps = {
  date: Date;
  decreaseMonth: () => void;
  increaseMonth: () => void;
  prevMonthButtonDisabled: boolean;
  nextMonthButtonDisabled: boolean;
};

// MOCK data for location suggestions (ensure images exist or remove image paths)
const MOCK_LOCATION_SUGGESTIONS = [
  { name: 'Nearby', description: 'Find what\'s around you', image: '/images/location-nearby.png' },
  { name: 'Stellenbosch', description: 'Western Cape', image: '/images/location-stellenbosch.png' },
  { name: 'Langebaan', description: 'For nature-lovers', image: '/images/location-langebaan.png' },
  { name: 'Onrus', description: 'Popular with travelers near you', image: '/images/location-onrus.png' },
  { name: 'Robertson', description: 'Western Cape', image: '/images/location-robertson.png' },
  { name: 'Stanford', description: 'Near you', image: '/images/location-stanford.png' },
  { name: 'Kleinmond', description: 'Popular with travelers near you', image: '/images/location-kleinmond.png' },
];


export default function SearchPopupContent({
  activeField,
  category,
  setCategory,
  location,
  setLocation,
  when,
  setWhen,
  closeAllPopups, // This now calls closeThisSearchBarsInternalPopups
  locationInputRef,
  categoryListboxOptionsRef,
}: SearchPopupContentProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    const timer = setTimeout(() => {
      if (activeField === 'location' && locationInputRef.current) {
        locationInputRef.current.focus();
      } else if (activeField === 'category' && categoryListboxOptionsRef.current) {
        const target =
          categoryListboxOptionsRef.current.querySelector('[aria-selected="true"]') ??
          categoryListboxOptionsRef.current.querySelector('[role="option"]');
        (target as HTMLElement | null)?.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeField, locationInputRef, categoryListboxOptionsRef]);

  const handleLocationSelect = useCallback(
    (place: { name: string; formatted_address?: string }) => {
      const displayName = place.formatted_address || place.name || '';
      setLocation(displayName);
      closeAllPopups(); // Close popup after selection
    },
    [setLocation, closeAllPopups],
  );

  const handleCategorySelect = useCallback((c: Category | null) => {
    setCategory(c);
    closeAllPopups(); // Close popup after selection
  }, [setCategory, closeAllPopups]);

  const handleDateSelect = useCallback((date: Date | null) => {
    setWhen(date);
    closeAllPopups(); // Close popup after selection
  }, [setWhen, closeAllPopups]);

  const filteredSuggestions = MOCK_LOCATION_SUGGESTIONS.filter((item) =>
    location === '' ||
    item.name.toLowerCase().includes(location.toLowerCase()) ||
    item.description?.toLowerCase().includes(location.toLowerCase())
  );

  const renderLocation = () => (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-4" id="search-popup-label-location">Suggested destinations</h3>
      <ul className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-hidden scrollbar-thin">
        {filteredSuggestions.map((s) => (
          <li
            key={s.name}
            role="option"
            aria-label={`${s.name}${s.description ? `, ${s.description}` : ''}`}
            onClick={() => handleLocationSelect({ name: s.name, formatted_address: s.description })}
            className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition"
            tabIndex={0}
          >
            {s.image && <img src={s.image} alt="" className="h-10 w-10 rounded-lg object-cover flex-shrink-0" />}
            <div>
              <p className="text-sm font-medium text-gray-800">{s.name}</p>
              <p className="text-xs text-gray-500">{s.description}</p>
            </div>
          </li>
        ))}
        {location.length > 0 && filteredSuggestions.length === 0 && (
          <li className="col-span-2 text-sm text-gray-500 px-4 py-2">No suggestions found.</li>
        )}
      </ul>
    </div>
  );

  const renderDate = () => {
    if (!isClient) {
      return (
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Loading calendar...
        </div>
      );
    }

    return (
      <div className="flex justify-center w-full">
        <h3 className="text-sm font-semibold text-gray-800 sr-only" id="search-popup-label-when">Select date</h3>
        <ReactDatePicker
          selected={when}
          onChange={handleDateSelect}
          dateFormat="MMM d, yyyy"
          inline
          calendarClassName="react-datepicker-custom-calendar"
          renderCustomHeader={(props: CustomHeaderProps) => (
            <div className="flex justify-between items-center px-3 pt-2 pb-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // Prevents click from bubbling and closing the main header's overlay
                  props.decreaseMonth();
                }}
                disabled={props.prevMonthButtonDisabled}
                className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-40"
                aria-label="Previous month"
              >
                <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
              </button>
              <span className="text-base font-semibold text-gray-900 pointer-events-none select-none">
                {props.date.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation(); // Prevents click from bubbling and closing the main header's overlay
                  props.increaseMonth();
                }}
                disabled={props.nextMonthButtonDisabled}
                className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-40"
                aria-label="Next month"
              >
                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          )}
        />
      </div>
    );
  };

  const renderCategory = () => (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 mb-2" id="search-popup-label-category">Select an artist category</h3>
      <Listbox value={category} onChange={handleCategorySelect}>
        <Listbox.Options
          static // Keep options in DOM for ref access
          as="ul"
          ref={categoryListboxOptionsRef}
          className="max-h-60 overflow-auto rounded-lg bg-white py-1 focus:outline-none scrollbar-thin"
        >
          {UI_CATEGORIES.map((c) => (
            <Listbox.Option
              key={c.value}
              value={c}
              className={({ active, selected }) =>
                clsx(
                  'px-4 py-2 text-sm cursor-pointer transition',
                  active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700',
                  selected && 'font-semibold'
                )
              }
            >
              {c.label}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </Listbox>
    </div>
  );

  const renderDefault = () => (
    <div className="text-center text-gray-500 py-8">
      <h3 className="text-lg font-semibold mb-2" id="search-popup-label-default">Find artists for your event!</h3>
      <p className="text-sm">Click 'Where', 'When', or 'Category' to start.</p>
      <div className="mt-6">
        <h4 className="text-md font-semibold text-gray-700 mb-3">Popular Artist Locations</h4>
        <ul className="grid grid-cols-2 gap-4">
          {MOCK_LOCATION_SUGGESTIONS.slice(0, 4).map((s) => (
            <li
              key={`default-${s.name}`}
              onClick={() => {
                setLocation(s.name);
                closeAllPopups();
              }}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              {s.image && <img src={s.image} alt="" className="h-8 w-8 rounded-lg object-cover" />}
              <span className="text-sm">{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  switch (activeField) {
    case 'location':
      return renderLocation();
    case 'when':
      return renderDate();
    case 'category':
      return renderCategory();
    default:
      return renderDefault();
  }
}