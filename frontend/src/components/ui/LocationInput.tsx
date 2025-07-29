'use client';

import { useState, useEffect, useRef } from 'react';
import usePlacesService from 'react-google-autocomplete/lib/usePlacesAutocompleteService';
import { loadPlaces } from '@/lib/loadPlaces';
import { MapPinIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface CustomLocationInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onPlaceSelect: (place: google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
}

function LocationInputInner({
  value,
  onValueChange,
  onPlaceSelect,
  placeholder = 'Search location',
  className,
  inputClassName,
  required = false,
}: CustomLocationInputProps) {
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isDropdownVisible, setDropdownVisible] = useState(false);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const skipNextPredictionRef = useRef(false);

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
    }
  }, [placePredictions]);

  // 🎯 Trigger new predictions from user-typed input only
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 📝 Handle input change from user
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
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
        onFocus={() => {
          if (predictions.length > 0) setDropdownVisible(true);
        }}
        placeholder={placeholder}
        required={required}
        className={clsx(
          'w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none',
          inputClassName,
        )}
      />

      {isDropdownVisible && predictions.length > 0 && (
        <div className="absolute z-50 mt-2 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
          {predictions.map((prediction) => (
            <div
              key={prediction.place_id}
              onClick={() => handleSelect(prediction)}
              className="flex items-center px-4 py-2 text-sm cursor-pointer hover:bg-indigo-50"
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
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomLocationInput(props: CustomLocationInputProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const api = await loadPlaces();
      if (mounted && api) setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!loaded) {
    const { value, onValueChange, placeholder = 'Search location', className, inputClassName, required = false } = props;
    return (
      <div className={clsx('relative w-full', className)}>
        <input
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={clsx(
            'w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none',
            inputClassName,
          )}
        />
      </div>
    );
  }

  return <LocationInputInner {...props} />;
}
