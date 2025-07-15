'use client';
import { Fragment } from 'react';
import { Popover, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';

interface FilterPopoverProps {
  categories: string[];
  selectedCategory?: string;
  onSelect: (c: string) => void;
  verifiedOnly: boolean;
  onVerified: (v: boolean) => void;
}

export default function FilterPopover({
  categories,
  selectedCategory,
  onSelect,
  verifiedOnly,
  onVerified,
}: FilterPopoverProps) {
  return (
    <Popover className="relative">
      <Popover.Button
        className="flex items-center text-sm hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        data-testid="more-filters"
      >
        More filters
        <ChevronDownIcon className="ml-1 h-4 w-4" aria-hidden="true" />
      </Popover.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <Popover.Panel className="absolute z-10 mt-2 w-56 rounded-lg bg-white shadow-lg p-4 space-y-2">
          {categories.map((c) => (
            <label key={c} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedCategory === c}
                onChange={() => onSelect(c)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
              />
              <span>{c}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => onVerified(e.target.checked)}
              className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span>Verified Only</span>
          </label>
        </Popover.Panel>
      </Transition>
    </Popover>
  );
}
