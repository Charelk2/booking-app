import { Fragment, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useLoadScript } from '@react-google-maps/api';
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

  useEffect(() => {
    if (!open || !isLoaded || autoRef.current || !inputRef.current) return;
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current);
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.formatted_address) onSelect(place.formatted_address);
    });
    autoRef.current = autocomplete;
    console.log('Autocomplete initialized');
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
            <div className="relative bg-white rounded-lg shadow-md w-full max-w-sm p-6 space-y-4">
              <Dialog.Title className="text-lg font-medium text-gray-900">Select Location</Dialog.Title>
              <TextInput
                ref={inputRef}
                placeholder="Search"
                className="w-full"
                loading={!isLoaded}
                autoFocus
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md"
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
