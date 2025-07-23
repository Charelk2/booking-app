// src/components/ui/StandardAutocompleteInput.tsx

'use client';

import { useRef, useEffect } from 'react';

interface StandardAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function StandardAutocompleteInput({
  value,
  onChange,
  placeholder = 'Search address...',
}: StandardAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    // Exit if the Google Maps script isn't loaded yet
    if (!window.google || !inputRef.current) {
      return;
    }

    // Initialize the Autocomplete service
    const autocomplete = new window.google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ['geocode'], // You can adjust types (e.g., 'establishment')
        fields: ['formatted_address'], // Ask for specific data to reduce cost
      },
    );
    autocompleteRef.current = autocomplete;

    // Add listener for when a user selects a place
    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place && place.formatted_address) {
        onChange(place.formatted_address);
      }
    });

    // Clean up the listener when the component unmounts
    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [onChange]);

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2"
    />
  );
}