// src/components/search/SearchPopupContent.tsx
'use client';

import React, { useEffect, useState, RefObject, useCallback, useRef } from 'react';
import Image from 'next/image';
import ReactDatePicker from 'react-datepicker';
import { Listbox } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import useServiceCategories from '@/hooks/useServiceCategories';
import { getServiceProviders } from '@/lib/api';
import type { ServiceProviderProfile } from '@/types';
import { AUTOCOMPLETE_LISTBOX_ID } from '../ui/LocationInput';

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
  setActiveField: (f: ActivePopup) => void; // Switch to another field without closing
  locationInputRef: RefObject<HTMLInputElement>;
  categoryListboxOptionsRef: RefObject<HTMLUListElement>;
  locationPredictions: google.maps.places.AutocompletePrediction[];
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
  { name: 'Nearby', description: 'Find what\'s around you', image: '/location-nearby.png' },
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
  setActiveField,
  locationInputRef,
  categoryListboxOptionsRef,
  locationPredictions,
}: SearchPopupContentProps) {
  const [isClient, setIsClient] = useState(false);
  // Live region message used to announce selections to assistive tech.
  // This complements the LocationInput combobox by surfacing changes
  // from both the location and category pickers.
  const [announcement, setAnnouncement] = useState('');
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<ServiceProviderProfile[]>([]);
  const artistInputRef = useRef<HTMLInputElement>(null);
  const categories = useServiceCategories();
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);

    const timer = setTimeout(() => {
      if (activeField === 'location' && locationInputRef.current) {
        locationInputRef.current.focus();
      } else if (activeField === 'category') {
        // Autofocus the artist search input when Category panel opens
        if (artistInputRef.current) {
          artistInputRef.current.focus();
          artistInputRef.current.select?.();
        } else if (categoryListboxOptionsRef.current) {
          const target =
            categoryListboxOptionsRef.current.querySelector('[aria-selected="true"]') ??
            categoryListboxOptionsRef.current.querySelector('[role="option"]');
          (target as HTMLElement | null)?.focus();
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeField, locationInputRef, categoryListboxOptionsRef]);

  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const res = await getServiceProviders({ artist: artistQuery, limit: 5 });
        setArtistResults(res.data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [artistQuery]);

  const handleLocationSelect = useCallback(
    (place: { name: string; formatted_address?: string }) => {
      const displayName = place.formatted_address || place.name || '';
      setLocation(displayName);
      setAnnouncement(`Location selected: ${displayName}`);
      closeAllPopups(); // Close popup after selection
    },
    [setLocation, closeAllPopups],
  );

  const handleCategorySelect = useCallback(
    (c: Category | null) => {
      setCategory(c);
      setAnnouncement(`Category selected: ${c ? c.label : 'none'}`);
      // Advance to next step: date picker
      setActiveField('when');
    },
    [setCategory, setActiveField],
  );

  const handleArtistSelect = useCallback(
    (a: ServiceProviderProfile) => {
      const name = a.business_name || `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
      setAnnouncement(`Service Provider selected: ${name}`);
      closeAllPopups();
      setArtistQuery('');
      setArtistResults([]);
      router.push(`/service-providers/${a.user_id}`);
    },
    [closeAllPopups, router],
  );

  const handleDateSelect = useCallback((date: Date | null) => {
    setWhen(date);
    // Advance to next step: location
    setActiveField('location');
  }, [setWhen, setActiveField]);

  // Renders the location suggestion list as an ARIA-compliant listbox.
  // The list shares an ID with LocationInput so the input's
  // aria-activedescendant points to these options.
  const renderLocation = () => {
    const activeId =
      locationInputRef.current?.getAttribute('aria-activedescendant') || undefined;
    if (location.trim().length === 0) {
      return (
        <div>
          <h3
            className="text-sm font-semibold text-gray-800 mb-4"
            id="search-popup-label-location"
          >
            Suggested destinations
          </h3>
          {/* Enable vertical scrolling when suggestions exceed container height */}
          {/* Use a single column on small screens and limit height to half the viewport */}
          <ul
            id={AUTOCOMPLETE_LISTBOX_ID}
            role="listbox"
            aria-labelledby="search-popup-label-location"
            aria-activedescendant={activeId}
            className="grid grid-cols-1 sm:grid-cols-1 gap-4 max-h-[50vh] overflow-y-auto scrollbar-thin"
          >
            {MOCK_LOCATION_SUGGESTIONS.map((s, index) => {
              const optionId = `suggestion-${index}`;
              return (
                <li
                  key={s.name}
                  id={optionId}
                  role="option"
                  aria-selected={activeId === optionId}
                  aria-label={`${s.name}${
                    s.description ? `, ${s.description}` : ''
                  }`}
                  onClick={() =>
                    handleLocationSelect({
                      name: s.name,
                      formatted_address: s.description,
                    })
                  }
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                  tabIndex={-1}
                >
                  {s.image && (
                    <Image
                      src={s.image}
                      alt={s.name}
                      width={40}
                      height={40}
                      sizes="40px"
                      className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-500">{s.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    return (
      <ul
        id={AUTOCOMPLETE_LISTBOX_ID}
        role="listbox"
        aria-labelledby="search-popup-label-location"
        aria-activedescendant={activeId}
        className="max-h-[300px] overflow-y-auto scrollbar-thin"
      >
        {locationPredictions.map((p, index) => {
          const optionId = p.place_id || `prediction-${index}`;
          return (
            <li
              key={p.place_id || p.description}
              id={optionId}
              onClick={() =>
                handleLocationSelect({
                  name: p.description,
                  formatted_address: p.description,
                })
              }
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition"
              role="option"
              aria-selected={activeId === optionId}
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {p.structured_formatting.main_text}
                </p>
                {p.structured_formatting.secondary_text && (
                  <p className="text-xs text-gray-500">
                    {p.structured_formatting.secondary_text}
                  </p>
                )}
              </div>
            </li>
          );
        })}
        {locationPredictions.length === 0 && (
          <li className="text-sm text-gray-500 px-4 py-2">Loading search...</li>
        )}
      </ul>
    );
  };

  const renderDate = () => {
    if (!isClient) {
      return (
        <div className="flex items-center justify-center h-[300px] text-gray-500">
          Loading calendar...
        </div>
      );
    }

    return (
      <div className="flex justify-center items-center w-full">
        <h3 className="text-sm font-semibold text-gray-800 sr-only" id="search-popup-label-when">Select date</h3>
        <ReactDatePicker
          selected={when}
          onChange={handleDateSelect}
          // Provide handler so react-datepicker's outside click logic always has a function to call
          onClickOutside={closeAllPopups}
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
      <input
        type="text"
        ref={artistInputRef}
        value={artistQuery}
        onChange={(e) => setArtistQuery(e.target.value)}
        placeholder="Search"
        className="mb-3 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-0"
        aria-label="Search"
      />
      {artistResults.length > 0 && (
        <ul className="mb-4 max-h-40 bg-white overflow-auto rounded-md">
          {artistResults.map((a) => {
            const name =
              a.business_name ||
              `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
            return (
              <li key={a.user_id}>
                <button
                  type="button"
                  onClick={() => handleArtistSelect(a)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                >
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <h3
        className="text-sm font-semibold text-gray-800 mb-2"
        id="search-popup-label-category"
      >
        Select an service category
      </h3>
      <Listbox value={category} onChange={handleCategorySelect}>
        {/* HeadlessUI Listbox handles arrow key navigation; we expose
            aria-selected on each option for screen reader parity. */}
        <Listbox.Options
          static // Keep options in DOM for ref access
          as="ul"
          ref={categoryListboxOptionsRef}
          className="max-h-60 overflow-auto rounded-lg bg-white py-1 focus:outline-none scrollbar-thin"
        >
          {categories.map((c, index) => (
            <Listbox.Option key={c.value} value={c} as={React.Fragment}>
              {({ active, selected }) => (
                <li
                  id={`category-option-${index}`}
                  role="option"
                  aria-selected={selected}
                  className={clsx(
                    'px-4 py-2 text-sm cursor-pointer transition hover:bg-gray-100 hover:text-gray-900',
                    active ? 'bg-gray-200 text-gray-900 hover:bg-gray-200 text-semi-bold' : 'text-gray-700',
                    selected && 'font-semibold',
                  )}
                >
                  {c.label}
                </li>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </Listbox>
    </div>
  );

  const renderDefault = () => (
    <div className="text-center text-gray-500 py-8">
      <h3 className="text-lg font-semibold mb-2" id="search-popup-label-default">Find service providers for your event!</h3>
      <p className="text-sm">Click &quot;Where&quot;, &quot;When&quot;, or &quot;Category&quot; to start.</p>
      <div className="mt-6">
        <h4 className="text-md font-semibold text-gray-700 mb-3">Popular Service Provider Locations</h4>
        {/* Responsive grid: stack suggestions on small screens */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MOCK_LOCATION_SUGGESTIONS.slice(0, 4).map((s) => (
            <li
              key={`default-${s.name}`}
              onClick={() => {
                setLocation(s.name);
                closeAllPopups();
              }}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              {s.image && (
                <Image
                  src={s.image}
                  alt={s.name}
                  width={32}
                  height={32}
                  sizes="32px"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              )}
              <span className="text-sm">{s.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const content = (() => {
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
  })();

  return (
    <>
      {/* Screen reader announcement area */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {content}
    </>
  );
}
