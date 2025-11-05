// src/components/ui/LocationMapModal.tsx
import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import LocationInput from './LocationInput';



export interface LocationMapModalProps {
  open: boolean;
  onClose: () => void;
  initialValue: string;
  onSelect: (place: google.maps.places.PlaceResult) => void;
}

export default function LocationMapModal({
  open,
  onClose,
  initialValue,
  onSelect,
}: LocationMapModalProps) {
  // The modal now manages its own input state
  const [location, setLocation] = useState(initialValue);

  // Reset the input when modal opens with a new initial value
  useEffect(() => {
    if (open) {
      setLocation(initialValue);
    }
  }, [open, initialValue]);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    onSelect(place);
    onClose(); // Close modal after selection
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        open={open}
        onClose={onClose}
      >
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

        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="relative bg-white rounded-lg shadow-md w-full max-w-sm p-6 space-y-4">
              <Dialog.Title className="text-lg font-medium text-gray-900">
                Select Location
              </Dialog.Title>

              {/* REFACTORED: Use the universal component */}
              <LocationInput
                value={location}
                onValueChange={setLocation}
                onPlaceSelect={handlePlaceSelect}
                placeholder="Search address"
                className="block w-full rounded-md border border-gray-300 focus-within:border-brand focus-within:ring-brand sm:text-sm p-2"
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
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}