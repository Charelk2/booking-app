import { Fragment, useEffect, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useLoadScript, GoogleMap, Marker } from '@react-google-maps/api';
import TextInput from './TextInput';

const MAP_LIBRARIES = ['places'] as const;

export interface LocationMapModalProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onSelect: (addr: string) => void;
}

export default function LocationMapModal({
  open,
  onClose,
  value,
  onSelect,
}: LocationMapModalProps) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: MAP_LIBRARIES,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!open || !isLoaded || autoRef.current || !inputRef.current) return;
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) onSelect(place.formatted_address);
      if (place.geometry && place.geometry.location) {
        setMarker({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    });
    autoRef.current = autocomplete;
    return () => {
      autoRef.current = null;
    };
  }, [open, isLoaded, onSelect]);

  useEffect(() => {
    if (inputRef.current && open) {
      inputRef.current.value = value;
    }
  }, [value, open]);

  return (
    <Transition show={open} as={Fragment}>
      <Dialog as="div" className="fixed inset-0 z-50" onClose={onClose} data-testid="location-map-modal">
        <div className="min-h-screen flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-4 space-y-4">
              <Dialog.Title className="text-lg font-medium text-gray-900">Select Location</Dialog.Title>
              <TextInput ref={inputRef} placeholder="Search" className="w-full" loading={!isLoaded} />
              <div className="h-60 w-full rounded overflow-hidden bg-gray-200">
                {marker && isLoaded && (
                  <GoogleMap
                    center={marker}
                    zoom={14}
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                  >
                    <Marker position={marker} />
                  </GoogleMap>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
