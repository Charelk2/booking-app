import { useEffect, useRef, useState } from 'react';
import { useLoadScript } from '@react-google-maps/api';
import TextInput from './TextInput';
import LocationMapModal from './LocationMapModal';

const MAP_LIBRARIES = ['places'] as const;

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function LocationInput({
  value,
  onChange,
  placeholder = 'Location',
  className,
}: LocationInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoRef = useRef<google.maps.places.Autocomplete | null>(null);
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: MAP_LIBRARIES,
  });
  const [modalOpen, setModalOpen] = useState(false);

  const handleClose = () => {
    setModalOpen(false);
    inputRef.current?.blur();
  };

  useEffect(() => {
    if (!isLoaded || autoRef.current || !inputRef.current) return;
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) onChange(place.formatted_address);
    });
    autoRef.current = autocomplete;
    return () => {
      autoRef.current = null;
    };
  }, [isLoaded, onChange]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = value;
  }, [value]);

  return (
    <>
      <TextInput
        ref={inputRef}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        loading={!isLoaded}
        data-testid="location-input"
        onFocus={() => setModalOpen(true)}
      />
      <LocationMapModal
        open={modalOpen}
        onClose={handleClose}
        value={value}
        onSelect={(addr) => {
          onChange(addr);
          handleClose();
        }}
      />
    </>
  );
}
