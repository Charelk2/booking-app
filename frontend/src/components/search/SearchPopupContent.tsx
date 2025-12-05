// src/components/search/SearchPopupContent.tsx
'use client';

import React, { useEffect, useState, RefObject, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import SafeImage from '@/components/ui/SafeImage';
import ReactDatePicker from 'react-datepicker';
import { Listbox } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import useServiceCategories from '@/hooks/useServiceCategories';
import {
  getServiceProviders,
  getPopularLocationSuggestions,
  getSearchHistory,
  type SearchHistoryItem,
  type PopularLocationSuggestion,
} from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';
import type { ServiceProviderProfile } from '@/types';
import { AUTOCOMPLETE_LISTBOX_ID } from '../ui/LocationInput';
import {
  getRecentSearches,
  type RecentSearch,
} from '@/lib/recentSearchStore';

import type { ActivePopup, Category } from './types';

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
  locationCityOnly?: boolean;
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
  locationCityOnly = false,
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
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  type PopularLocation = PopularLocationSuggestion | (typeof MOCK_LOCATION_SUGGESTIONS)[number];
  const [popularLocations, setPopularLocations] = useState<PopularLocation[]>([]);

  // Artist quick search state (unchanged)

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
    const localRecents = getRecentSearches();
    setRecentSearches(localRecents);

    // Best-effort: if the user is logged in, merge server history with local recents.
    (async () => {
      try {
        const serverHistory: SearchHistoryItem[] = await getSearchHistory(10);
        if (!serverHistory || serverHistory.length === 0) {
          return;
        }
        const mappedFromServer: RecentSearch[] = serverHistory.map((item) => ({
          categoryLabel: item.category_value || undefined,
          categoryValue: item.category_value || undefined,
          location: item.location || undefined,
          whenISO: item.when || null,
          createdAt: item.created_at || new Date().toISOString(),
        }));

        const combined = [...localRecents, ...mappedFromServer];
        const byKey = new Map<string, RecentSearch>();

        for (const entry of combined) {
          const key = `${entry.categoryValue ?? ''}|${(entry.location ?? '').trim()}|${entry.whenISO ?? ''}`;
          const existing = byKey.get(key);
          if (!existing || (entry.createdAt && entry.createdAt > existing.createdAt)) {
            byKey.set(key, entry);
          }
        }

        const merged = Array.from(byKey.values()).sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : -1,
        );
        setRecentSearches(merged);
      } catch {
        // 401 or network errors → keep local-only recents
      }
    })();
  }, []);

  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      try {
        const res = await getServiceProviders({
          artist: artistQuery,
          limit: 5,
          // Allow quick artist lookup even when the current page is Inbox,
          // which normally suppresses provider list fetches.
          allowOnInbox: true,
        });
        setArtistResults(res.data);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [artistQuery]);

  const recentLocations = useMemo(
    () =>
      Array.from(
        new Set(
          recentSearches
            .map((s) => s.location?.trim())
            .filter((loc): loc is string => !!loc),
        ),
      ),
    [recentSearches],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await getPopularLocationSuggestions(6);
        if (!cancelled && items && items.length > 0) {
          setPopularLocations(items);
        }
      } catch {
        // Best-effort; fall back to mock suggestions
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // no-op helpers removed

  const handleLocationSelect = useCallback(
    (prediction: google.maps.places.AutocompletePrediction) => {
      let displayName = prediction.description || '';
      if (locationCityOnly) {
        const main = prediction.structured_formatting?.main_text || '';
        let secondary = prediction.structured_formatting?.secondary_text || '';
        secondary = secondary.replace(/,?\s*South Africa$/i, '').trim();
        const parts = secondary.split(/,\s*/).filter(Boolean);
        // Prefer only the city/town name for SearchBar
        const city = parts[0] || main;
        displayName = city;
      }
      setLocation(displayName);
      setAnnouncement(`Location selected: ${displayName}`);
      closeAllPopups();
    },
    [setLocation, closeAllPopups, locationCityOnly],
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
      router.push(`/${a.slug || a.user_id}`);
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
            className="sr-only"
            id="search-popup-label-location"
          >
            Location suggestions
          </h3>
          <div className="space-y-4">
            {recentLocations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Recent locations
              </h4>
                <ul className="space-y-1">
                  {recentLocations.slice(0, 4).map((loc) => (
                    <li key={`recent-loc-${loc}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setLocation(loc);
                          closeAllPopups();
                        }}
                        className="flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[11px] font-medium text-gray-600">
                          {loc.slice(0, 2).toUpperCase()}
                        </span>
                        <span>{loc}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Popular locations
              </h4>
              {/* Keep listbox for LocationInput a11y */}
              <ul
                id={AUTOCOMPLETE_LISTBOX_ID}
                role="listbox"
                aria-labelledby="search-popup-label-location"
                aria-activedescendant={activeId}
                className="space-y-1 max-h-[50vh] overflow-y-auto scrollbar-thin"
              >
                {(popularLocations.length > 0 ? popularLocations : MOCK_LOCATION_SUGGESTIONS).slice(0, 3).map((s, index) => {
                  const name = (s as any).name as string;
                  const description = (s as any).description as string | undefined;
                  const optionId = `suggestion-${index}`;
                  return (
                    <li
                      key={name}
                      id={optionId}
                      role="option"
                      aria-selected={activeId === optionId}
                      aria-label={`${name}${
                        description ? `, ${description}` : ''
                      }`}
                      onClick={() =>
                        handleLocationSelect({
                          description: name,
                          structured_formatting: {
                            main_text: name,
                            secondary_text: description || '',
                          },
                        } as unknown as google.maps.places.AutocompletePrediction)
                      }
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                      tabIndex={-1}
                      >
                      {(s as any).image && (
                        <SafeImage
                          src={(s as any).image}
                          alt={name}
                          width={40}
                          height={40}
                          sizes="40px"
                          className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
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
              onClick={() => handleLocationSelect(p)}
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
                className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-40"
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
                className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-40"
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
        className="mb-3 w-full rounded-md border border-black px-3 py-2 text-sm focus:outline-none focus:ring-0"
        aria-label="Search"
      />
      {artistResults.length > 0 && (
        <ul className="mb-4 max-h-40 bg-white overflow-auto rounded-md">
          {artistResults.map((a) => {
            const name =
              a.business_name ||
              `${a.user?.first_name ?? ''} ${a.user?.last_name ?? ''}`.trim();
            const avatarUrl =
              getFullImageUrl(
                (a as any).profile_picture_url || (a as any).portfolio_urls?.[0],
              ) || undefined;
            const initial =
              (name || '').trim().charAt(0)?.toUpperCase() || '?';
            return (
              <li key={a.user_id}>
                <button
                  type="button"
                  onClick={() => handleArtistSelect(a)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    {avatarUrl ? (
                      <SafeImage
                        src={avatarUrl}
                        alt={name}
                        width={32}
                        height={32}
                        sizes="32px"
                        className="h-8 w-8 rounded-full object-cover flex-shrink-0 bg-gray-100"
                      />
                    ) : (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 flex-shrink-0">
                        {initial}
                      </span>
                    )}
                    <span className="truncate">{name}</span>
                  </span>
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
                    'px-4 py-2 text-sm cursor-pointer transition hover:bg-gray-100 rounded-lg hover:text-gray-900',
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
      <h3
        className="text-lg font-semibold mb-2 text-gray-900"
        id="search-popup-label-default"
      >
        Plan your next event in seconds
      </h3>
      <p className="text-sm text-gray-600">
        Start by choosing a service, then add a date and location.
      </p>

      {recentSearches.length > 0 && (
        <div className="mt-6">
          <h4 className="text-md font-semibold text-gray-700 mb-3">
            Recent searches on this device
          </h4>
          <div className="flex flex-wrap justify-center gap-2">
            {recentSearches.slice(0, 6).map((search, index) => {
              const hasLocation = !!search.location;
              const hasWhen = !!search.whenISO;

              const labelParts: string[] = [];

              if (search.categoryLabel) {
                labelParts.push(search.categoryLabel);
              } else {
                labelParts.push('Any service');
              }

              if (hasLocation) {
                labelParts.push(search.location as string);
              }

              let subtitle: string | null = null;
              if (hasWhen) {
                try {
                  const date = new Date(search.whenISO as string);
                  const formatter = new Intl.DateTimeFormat('en-ZA', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  });
                  subtitle = formatter.format(date);
                } catch {
                  subtitle = null;
                }
              }

              const label = labelParts.join(' · ');

              return (
                <button
                  key={`${label}-${index}`}
                  type="button"
                  onClick={() => {
                    if (search.location) {
                      setLocation(search.location);
                    }
                    if (search.whenISO) {
                      try {
                        setWhen(new Date(search.whenISO));
                      } catch {
                        // ignore invalid date
                      }
                    }
                    // For now we don't change category here to avoid rehydration complexity.
                    closeAllPopups();
                  }}
                  className="inline-flex flex-col items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 active:scale-[0.98] transition"
                >
                  <span className="font-medium">{label}</span>
                  {subtitle && (
                    <span className="text-[11px] text-gray-500">
                      {subtitle}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h4 className="text-md font-semibold text-gray-700 mb-3">
          Popular Service Provider Locations
        </h4>
        {/* Responsive grid: stack suggestions on small screens */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(popularLocations.length > 0 ? popularLocations : MOCK_LOCATION_SUGGESTIONS).slice(0, 4).map((s) => {
            const name = (s as any).name as string;
            const image = (s as any).image as string | undefined;
            return (
            <li
              key={`default-${name}`}
              onClick={() => {
                setLocation(name);
                closeAllPopups();
              }}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-100 cursor-pointer"
            >
              {image && (
                <Image
                  src={image}
                  alt={name}
                  width={32}
                  height={32}
                  sizes="32px"
                  className="h-8 w-8 rounded-lg object-cover"
                />
              )}
              <span className="text-sm">{name}</span>
            </li>
          ); })}
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
