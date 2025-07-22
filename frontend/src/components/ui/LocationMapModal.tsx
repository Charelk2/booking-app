import { Fragment, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';

// The <gmpx-place-autocomplete> element is registered globally via
// a module script in layout.tsx. It loads the Maps JS SDK internally.

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
  const autoRef = useRef<Element | null>(null);

  useEffect(() => {
    const el = autoRef.current as HTMLElement | null;
    if (!open || !el) return;
    function handleChange(e: Event) {
      const place = (e as any).detail?.place;
      if (place?.formatted_address) {
        onSelect(place.formatted_address);
        onClose();
      }
    }
    el.addEventListener('placechange', handleChange);
    el.addEventListener('gmpx-placechange', handleChange);
    return () => {
      el.removeEventListener('placechange', handleChange);
      el.removeEventListener('gmpx-placechange', handleChange);
    };
  }, [open, onSelect, onClose]);

  useEffect(() => {
    if (open && autoRef.current) {
      // @ts-ignore - value is writable on the web component
      (autoRef.current as any).value = value;
    }
  }, [open, value]);

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
              <gmpx-place-autocomplete
                ref={autoRef}
                placeholder="Search"
                className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-brand focus:ring-brand sm:text-sm p-2"
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
