// src/components/ui/LocationInput.tsx
'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import usePlacesService from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { MapPinIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

// Define the type alias for Google's PlaceResult here for local clarity
// This ensures compatibility with the `google.maps.places.PlaceResult` type
// provided by @types/google.maps.
export type PlaceResult = google.maps.places.PlaceResult;

interface LocationInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string; // For the outer div container
  inputClassName?: string; // For the input element itself
}

// Use forwardRef to allow parent components to pass a ref to the internal input element
const LocationInput = forwardRef<HTMLInputElement, LocationInputProps>(
  ({ value, onValueChange, onPlaceSelect, placeholder = 'Search location', className, inputClassName }, ref) => {
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null); // For detecting outside clicks for the entire component
    const inputInternalRef = useRef<HTMLInputElement>(null); // Internal ref for the input element

    // Expose the internal input ref's direct DOM element methods (like .focus()) to the outside world
    useImperativeHandle(ref, () => inputInternalRef.current as HTMLInputElement, []);

    const listboxId = 'autocomplete-options';

    const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!googleMapsApiKey) {
      console.error(
        'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Location autocomplete will be disabled.',
      );
    }

    const {
      placesService,
      placePredictions,
      getPlacePredictions,
    } = usePlacesService({
      apiKey: googleMapsApiKey,
      debounce: 300,
      options: {
        componentRestrictions: { country: ['za'] }, // Filter to South Africa
        // types: ['(cities)'], // Optional: uncomment if you only want city results
      }
    });

    // 🌍 Get user's current location once
    useEffect(() => {
      if (typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
            console.log("User location obtained:", { lat: position.coords.latitude, lng: position.coords.longitude });
          },
          (error) => {
            console.warn('Geolocation error:', error);
          }
        );
      }
    }, []);

    const arePredictionsEqual = (
      a: google.maps.places.AutocompletePrediction[],
      b: google.maps.places.AutocompletePrediction[],
    ) =>
      a.length === b.length &&
      a.every((pred, idx) => pred.place_id === b[idx].place_id);

    // 🔄 Update predictions when Google returns new ones
    useEffect(() => {
      if (!placePredictions) return;

      setPredictions((prev) =>
        arePredictionsEqual(prev, placePredictions) ? prev : placePredictions,
      );
      setDropdownVisible(placePredictions.length > 0);
      if (placePredictions.length > 0) {
        setHighlightedIndex(-1);
      }
    }, [placePredictions]);

    // Clear predictions when input is emptied
    useEffect(() => {
      if (value.trim().length === 0) {
        setPredictions([]);
        setDropdownVisible(false);
        setHighlightedIndex(-1);
      }
    }, [value]);

    // Keep getPlacePredictions in a ref to avoid it being a changing dependency
    // which can cause this effect to fire continuously and exceed the update depth
    const getPredictionsRef = useRef(getPlacePredictions);

    useEffect(() => {
      getPredictionsRef.current = getPlacePredictions;
    }, [getPlacePredictions]);

    // 🎯 Trigger new predictions from user input
    useEffect(() => {
      if (value.trim().length > 0) {
        getPredictionsRef.current({
          input: value,
          ...(userLocation && {
            location: new google.maps.LatLng(userLocation.lat, userLocation.lng),
            radius: 30000, // 30km radius
          }),
          sessionToken: new google.maps.places.AutocompleteSessionToken(),
        });
      }
    }, [value, userLocation]);

    // 🖱 Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent | TouchEvent) => {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setDropdownVisible(false);
          setHighlightedIndex(-1);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }, []);

    // 📝 Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value);
      setDropdownVisible(true);
      setHighlightedIndex(-1);
    };

    // ⌨️ Handle keyboard selection for accessibility
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isDropdownVisible || predictions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % predictions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + predictions.length) % predictions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && predictions[highlightedIndex]) {
          handleSelect(predictions[highlightedIndex]);
        } else if (value.trim().length > 0 && predictions.length > 0) {
          handleSelect(predictions[0]);
        } else if (value.trim().length > 0) {
            onPlaceSelect({ name: value.trim(), formatted_address: value.trim() } as PlaceResult);
            setDropdownVisible(false);
            setPredictions([]);
        }
      } else if (e.key === 'Escape') {
        setDropdownVisible(false);
        inputInternalRef.current?.blur();
        onValueChange('');
      }
    };

    // ✅ Handle selecting a place (from click or keyboard Enter)
    const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
      setPredictions([]);
      setDropdownVisible(false);

      if (!placesService) {
        console.error("Google Places Service not available. Check API key and script loading.");
        onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
        onValueChange(prediction.description);
        return;
      }

      if (prediction.place_id) {
        placesService.getDetails(
          { placeId: prediction.place_id, fields: ['name', 'formatted_address', 'geometry'] },
          (placeDetails: google.maps.places.PlaceResult | null, status: google.maps.places.PlacesServiceStatus) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && placeDetails) {
              onPlaceSelect(placeDetails as PlaceResult);
              onValueChange(placeDetails.formatted_address || placeDetails.name || prediction.description);
            } else {
              console.error('PlacesService.getDetails failed:', status);
              onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
              onValueChange(prediction.description);
            }
          }
        );
      } else {
        onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
        onValueChange(prediction.description);
      }
    };

    return (
      <div ref={containerRef} className={clsx('relative w-full', className)}>
        <input
          ref={inputInternalRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (predictions.length > 0 || value.length > 0) {
              setDropdownVisible(true);
            }
          }}
          placeholder={placeholder}
          className={clsx(
            'w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none',
            inputClassName,
          )}
          role="combobox"
          aria-expanded={isDropdownVisible}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedIndex >= 0 && predictions[highlightedIndex]
              ? predictions[highlightedIndex].place_id || `prediction-${highlightedIndex}`
              : undefined
          }
        />

        {isDropdownVisible && predictions.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="pac-container absolute z-50 mt-2 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 scrollbar-thin"
          >
            {predictions.map((prediction, index) => {
              const isActive = index === highlightedIndex;
              const placeName = prediction.structured_formatting.main_text;
              const placeDetails = prediction.structured_formatting.secondary_text;

              return (
                <div
                  key={prediction.place_id || `${prediction.description}-${index}`}
                  id={prediction.place_id || `prediction-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={() => handleSelect(prediction)}
                  className={clsx(
                    'flex items-center px-4 py-2 text-sm cursor-pointer',
                    isActive ? 'bg-indigo-100' : 'hover:bg-indigo-50'
                  )}
                  data-testid="location-option"
                >
                  <MapPinIcon className="h-5 w-5 text-gray-400 mr-3 shrink-0" />
                  <div>
                    <span className="font-medium text-gray-800">
                      {placeName}
                    </span>
                    {placeDetails && (
                      <span className="text-gray-500 ml-2">
                        {placeDetails}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

LocationInput.displayName = 'LocationInput';
export default LocationInput;