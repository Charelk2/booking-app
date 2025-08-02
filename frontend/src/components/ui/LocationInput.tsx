'use client';

import React, { useState, useEffect, useRef, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import usePlacesService from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { MapPinIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

// Define the type alias for Google's PlaceResult here for local clarity
// This ensures compatibility with the `google.maps.places.PlaceResult` type
// provided by @types/google.maps. If you only deal with certain fields,
// you might create a stricter subset, but for full compatibility, this is best.
export type PlaceResult = google.maps.places.PlaceResult;

interface LocationInputProps { // Renamed from CustomLocationInputProps
  value: string;
  onValueChange: (value: string) => void;
  // Use the defined PlaceResult type for place selection
  onPlaceSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string; // For the outer div container
  inputClassName?: string; // For the input element itself
}

// Use forwardRef to allow parent components to pass a ref to the internal input element
const LocationInput = forwardRef<HTMLInputElement, LocationInputProps>( // Renamed from CustomLocationInput
  ({ value, onValueChange, onPlaceSelect, placeholder = 'Search location', className, inputClassName }, ref) => {
    const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
    const [isDropdownVisible, setDropdownVisible] = useState(false);
    const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null); // For detecting outside clicks for the entire component
    const inputInternalRef = useRef<HTMLInputElement>(null); // Internal ref for the input element

    // Expose the internal input ref's direct DOM element methods (like .focus()) to the outside world
    useImperativeHandle(ref, () => inputInternalRef.current as HTMLInputElement, []); // Explicitly cast here

    const listboxId = 'autocomplete-options';

    const {
      placesService,
      placePredictions,
      getPlacePredictions,
    } = usePlacesService({
      apiKey: process.env.NEXT_PUBLIC_Maps_API_KEY,
      debounce: 300,
      options: { // Options applied to all prediction requests
        componentRestrictions: { country: ['za'] }, // Filter to South Africa
        // types: ['(cities)'], // Optional: uncomment if you only want city results
      }
    });

    // 🌍 Get user's current location once
    useEffect(() => {
      // Ensure running in a browser environment
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
    }, []); // Empty dependency array ensures this runs only once on mount

    // 🔄 Update predictions when Google returns new ones
    useEffect(() => {
      if (placePredictions && placePredictions.length > 0) {
        setPredictions(placePredictions);
        setDropdownVisible(true);
        setHighlightedIndex(-1); // Reset highlight when new predictions arrive
      } else if (value.length > 0) {
        // If user typed something but no predictions are returned, hide dropdown
        setPredictions([]);
        setDropdownVisible(false);
        setHighlightedIndex(-1);
      } else {
        // If input is empty, clear predictions and hide dropdown
        setPredictions([]);
        setDropdownVisible(false);
        setHighlightedIndex(-1);
      }
    }, [placePredictions, value]); // Depend on placePredictions and value for re-evaluation


    // 🎯 Trigger new predictions from user input
    // This effect handles sending requests to Google Places API based on user input
    useEffect(() => {
      // Prevent redundant requests if value is cleared externally or after selection
      // This is handled by onValueChange and onPlaceSelect now without `skipNextPredictionRef`
      
      if (value.trim().length > 0) {
        getPlacePredictions({
          input: value,
          // Pass user location and radius directly here if you want to use it for API call
          // This overrides the options set in usePlacesService for this specific call.
          ...(userLocation && {
            location: new google.maps.LatLng(userLocation.lat, userLocation.lng),
            radius: 30000, // 30km radius
          }),
          sessionToken: new google.maps.places.AutocompleteSessionToken(), // Important for billing and results
        });
      } else {
        setPredictions([]);
        setDropdownVisible(false);
        setHighlightedIndex(-1);
      }
    }, [value, getPlacePredictions, userLocation]); // Dependencies: input value, the prediction getter, and user location


    // 🖱 Close dropdown on outside click
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent | TouchEvent) => { // Listen for touchstart as well
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setDropdownVisible(false);
          setHighlightedIndex(-1); // Clear highlight on close
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside); // Add touch listener
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside); // Clean up touch listener
      };
    }, []);

    // 📝 Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value);
      // When typing, always show the dropdown. Predictions will populate it.
      setDropdownVisible(true);
      setHighlightedIndex(-1); // Reset highlight on new input
    };

    // ⌨️ Handle keyboard selection for accessibility
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isDropdownVisible || predictions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % predictions.length); // Loop through predictions
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + predictions.length) % predictions.length); // Loop backwards
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && predictions[highlightedIndex]) {
          handleSelect(predictions[highlightedIndex]);
        } else if (value.trim().length > 0 && predictions.length > 0) {
          // If Enter is pressed without explicit highlight, but there are predictions,
          // select the first one.
          handleSelect(predictions[0]);
        } else if (value.trim().length > 0) {
            // If Enter with no predictions, but there's user input,
            // treat the current input as the selected "place" without fetching details.
            // This can be useful for places not found in Google, or simple text input.
            onPlaceSelect({ name: value.trim(), formatted_address: value.trim() } as PlaceResult);
            setDropdownVisible(false);
            setPredictions([]);
        }
      } else if (e.key === 'Escape') {
        setDropdownVisible(false);
        inputInternalRef.current?.blur(); // Remove focus from input to dismiss keyboard on mobile
        onValueChange(''); // Clear current value if Escape is pressed to abandon search
      }
    };

    // ✅ Handle selecting a place (from click or keyboard Enter)
    const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
      setPredictions([]); // Clear predictions immediately
      setDropdownVisible(false); // Hide dropdown

      if (!placesService) {
        console.error("Google Places Service not available. Check API key and script loading.");
        // Fallback: use prediction description if service is not ready
        onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
        onValueChange(prediction.description);
        return;
      }

      // Fetch place details using the place_id for more comprehensive info
      if (prediction.place_id) {
        placesService.getDetails(
          { placeId: prediction.place_id, fields: ['name', 'formatted_address', 'geometry'] }, // Specify fields to get relevant data
          (placeDetails: google.maps.places.PlaceResult | null, status: google.maps.places.PlacesServiceStatus) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && placeDetails) {
              onPlaceSelect(placeDetails as PlaceResult); // Pass the full PlaceResult object
              // Update input value with the most appropriate address or name
              onValueChange(placeDetails.formatted_address || placeDetails.name || prediction.description);
            } else {
              console.error('PlacesService.getDetails failed:', status);
              // Fallback: If details fail, use the basic description from prediction
              onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
              onValueChange(prediction.description);
            }
          }
        );
      } else {
        // This case should theoretically not happen for AutocompletePrediction with valid results,
        // but as a safeguard, directly use the description.
        onPlaceSelect({ name: prediction.description, formatted_address: prediction.description } as PlaceResult);
        onValueChange(prediction.description);
      }
    };

    return (
      <div ref={containerRef} className={clsx('relative w-full', className)}>
        <input
          ref={inputInternalRef} // Attach internal ref here
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            // Show dropdown on focus if there's any text or previous predictions to display
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
          aria-autocomplete="list" // Indicates that the input has a list of suggestions
          aria-activedescendant={
            highlightedIndex >= 0 && predictions[highlightedIndex]
              ? predictions[highlightedIndex].place_id || `prediction-${highlightedIndex}` // Use place_id for ARIA if available
              : undefined
          }
        />

        {isDropdownVisible && predictions.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-2 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 scrollbar-thin"
          >
            {predictions.map((prediction, index) => {
              const isActive = index === highlightedIndex;
              const placeName = prediction.structured_formatting.main_text;
              const placeDetails = prediction.structured_formatting.secondary_text;

              return (
                <div
                  // Use place_id as key if available, otherwise a unique combination of description and index
                  key={prediction.place_id || `${prediction.description}-${index}`}
                  // The id for aria-activedescendant must refer to the option element's ID
                  id={prediction.place_id || `prediction-${index}`}
                  role="option"
                  aria-selected={isActive} // ARIA for selected state
                  // Use onMouseDown to prevent the input from losing focus before the click event fires
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