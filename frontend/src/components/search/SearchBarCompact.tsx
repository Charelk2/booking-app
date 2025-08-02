'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface Props {
  category?: string | null;
  location?: string | null;
  when?: Date | null;
  onOpen: () => void;
}

/**
 * Compact pill-style search bar used as a trigger for the full search form.
 * Displays the current category, location and date placeholders and invokes
 * `onOpen` when clicked so callers can show the expanded search UI.
 */
export default function SearchBarCompact({ category, location, when, onOpen }: Props) {
  const handleClick = () => {
    onOpen();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center bg-white px-4 py-2 shadow-md rounded-full w-full transition-all duration-300 ease-out"
    >
      <div className="px-4 py-1 text-sm text-gray-700 flex-grow">
        {category || 'Choose category'}
      </div>
      <div className="px-4 py-1 text-sm text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis flex-grow">
        {location || 'Anywhere'}
      </div>
      <div className="px-4 py-1 text-sm text-gray-700 flex-grow">
        {when ? format(when, 'd\u00A0MMM\u00A0yyyy') : 'Add\u00A0date'}
      </div>
      <div className="p-1 bg-[var(--color-accent)] text-white rounded-full">
        <MagnifyingGlassIcon className="h-5 w-5" />
      </div>
    </button>
  );
}

