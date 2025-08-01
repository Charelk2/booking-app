'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import usePlacesService from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { MapPinIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface CustomLocationInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export default function CustomLocationInput({
  value,
  onValueChange,
  onPlaceSelect,
  placeholder = 'Search location',
  className,
  inputClassName,
}: CustomLocationInputProps) {
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextPredictionRef = useRef(false);
  const listboxId = 'autocomplete-options';

  const {
    placesService,
    placePredictions,
    getPlacePredictions,
  } = usePlacesService({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    debounce: 300,
  });

  // 🌍 Get user's current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Geolocation error:', error);
        }
      );
    }
  }, []);

  // 🔄 Update predictions when Google updates
  useEffect(() => {
    if (placePredictions.length > 0 && value.length > 0) {
      setPredictions(placePredictions);
      setDropdownVisible(true);
      setHighlightedIndex(-1);
    }
  }, [placePredictions]);

  // 🎯 Trigger new predictions from user input
  useEffect(() => {
    if (skipNextPredictionRef.current) {
      skipNextPredictionRef.current = false;
      return;
    }

    if (value.trim().length > 0) {
      getPlacePredictions({
        input: value,
        componentRestrictions: { country: 'za' },
        ...(userLocation && {
          location: new google.maps.LatLng(userLocation.lat, userLocation.lng),
          radius: 30000,
        }),
      });
    } else {
      setPredictions([]);
      setDropdownVisible(false);
    }
  }, [value, userLocation]);

  // 🖱 Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 📝 Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
  };

  // ⌨️ Handle keyboard selection
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownVisible || predictions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, predictions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(predictions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setDropdownVisible(false);
    }
  };

  // ✅ Handle selecting a place
  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    setPredictions([]);
    setDropdownVisible(false);

    placesService?.getDetails(
      { placeId: prediction.place_id },
      (placeDetails: google.maps.places.PlaceResult | null) => {
        if (placeDetails) {
          skipNextPredictionRef.current = true;
          onPlaceSelect(placeDetails);
          onValueChange(placeDetails.formatted_address || prediction.description);
        }
      }
    );
  };

  return (
    <div ref={containerRef} className={clsx('relative w-full', className)}>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (predictions.length > 0) setDropdownVisible(true);
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
          highlightedIndex >= 0 ? predictions[highlightedIndex]?.place_id : undefined
        }
      />

      {isDropdownVisible && predictions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-2 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5"
        >
{predictions.map((prediction, index) => {
  const isActive = index === highlightedIndex;
  return (
    <div
      key={prediction.place_id}
      id={prediction.place_id}
      role="option"
      aria-selected={isActive}
      onMouseDown={() => handleSelect(prediction)} // ✅ FIXED HERE
      className={clsx(
        'flex items-center px-4 py-2 text-sm cursor-pointer',
        isActive ? 'bg-indigo-100' : 'hover:bg-indigo-50'
      )}
      data-testid="location-option"
    >
      <MapPinIcon className="h-5 w-5 text-gray-400 mr-3 shrink-0" />
      <div>
        <span className="font-medium text-gray-800">
          {prediction.structured_formatting.main_text}
        </span>
        <span className="text-gray-500 ml-2">
          {prediction.structured_formatting.secondary_text}
        </span>
      </div>
    </div>
  );
})}

        </div>
      )}
    </div>
  );
}
