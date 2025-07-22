'use client';

import { useState, useEffect, forwardRef, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import LocationInput from '@/components/ui/LocationInput';

const CATEGORIES = [
  { value: 'musician', label: 'Musician / Band' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'dj', label: 'DJ' },
  { value: 'venue', label: 'Venue' },
];

// Map UI categories to service types understood by the backend API
const CATEGORY_TO_SERVICE: Record<string, string> = {
  musician: 'Live Performance',
};

// Reverse map for reading query params like ?category=Live%20Performance
const SERVICE_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_TO_SERVICE).map(([k, v]) => [v, k]),
);
type Category = typeof CATEGORIES[number];

interface SearchBarProps {
  size?: 'sm' | 'md';
  className?: string;
  wrapperClassName?: string;
}

interface FormFieldsProps {
  category: Category;
  setCategory: (c: Category) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  size: 'sm' | 'md';
}

const SearchFields = forwardRef<HTMLDivElement, FormFieldsProps>(
  (
    { category, setCategory, location, setLocation, when, setWhen, size },
    _ref
  ) => (
    <>
      {/* Category */}
      <div
        className={clsx(
          'flex-1 px-4 flex flex-col text-left',
          size === 'sm' ? 'py-2' : 'py-2.5'
        )}
      >
        <span className="text-xs text-gray-500">Category</span>
        <Listbox value={category} onChange={setCategory}>
          <div className="relative w-full">
            <Listbox.Button className="mt-1 w-full flex justify-between items-center text-sm text-gray-700 focus:outline-none">
              <span>{category.label}</span>
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            </Listbox.Button>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                {CATEGORIES.map((c) => (
                  <Listbox.Option
                    key={c.value}
                    value={c}
                    className={({ active }) =>
                      clsx(
                        'px-4 py-2 text-sm cursor-pointer',
                        active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700'
                      )
                    }
                  >
                    {c.label}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
      </div>

      <div className="border-l border-gray-200" />

      {/* Where */}
      <div
        className={clsx(
          'flex-1 px-4 flex flex-col text-left',
          size === 'sm' ? 'py-2' : 'py-2.5'
        )}
      >
        <span className="text-xs text-gray-500">Where</span>
        <LocationInput
          value={location}
          onChange={setLocation}
          placeholder="City or venue"
          className="mt-1 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
        />
      </div>

      <div className="border-l border-gray-200" />

      {/* When */}
      <div
        className={clsx(
          'flex-1 px-4 flex flex-col text-left',
          size === 'sm' ? 'py-2' : 'py-2.5'
        )}
      >
        <span className="text-xs text-gray-500">When</span>
        <ReactDatePicker
          selected={when}
          onChange={(d) => setWhen(d)}
          showTimeSelect
          dateFormat="MMM d, yyyy h:mm aa"
          placeholderText="Add date & time"
          className="mt-1 w-full text-sm text-gray-700 focus:outline-none"
        />
      </div>
    </>
  )
);
SearchFields.displayName = 'SearchFields';

export default function SearchBar({ size = 'md', className, wrapperClassName }: SearchBarProps) {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) {
      const found = CATEGORIES.find(
        (c) => c.value === catParam || CATEGORY_TO_SERVICE[c.value] === catParam,
      );
      if (found) setCategory(found);
    }
    const locParam = searchParams.get('location');
    if (locParam) setLocation(locParam);
    const whenParam = searchParams.get('when');
    if (whenParam) {
      const d = new Date(whenParam);
      if (!Number.isNaN(d.getTime())) setWhen(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (category) {
      const service = CATEGORY_TO_SERVICE[category.value] || category.value;
      params.set('category', service);
    }
    if (location) params.set('location', location);
    if (when) params.set('when', when.toISOString());
    const qs = params.toString();
    router.push(qs ? `/artists?${qs}` : '/artists');
  };

  return (
    <div className={clsx('relative', wrapperClassName)}>
      <form
        onSubmit={onSubmit}
        className={clsx(
          'flex items-stretch bg-white rounded-full ring-1 ring-gray-200 shadow-md overflow-visible min-h-[48px]',
          size === 'sm' && 'text-sm',
          className
        )}
      >
      <SearchFields
        category={category}
        setCategory={setCategory}
        location={location}
        setLocation={setLocation}
        when={when}
        setWhen={setWhen}
        size={size}
      />
      <button
        type="submit"
        className="bg-pink-600 hover:bg-pink-700 text-white flex items-center justify-center h-full aspect-square md:w-12 md:h-auto"
      >
        <MagnifyingGlassIcon className="w-5 h-5" />
        <span className="sr-only">Search</span>
      </button>
    </form>
    <div className="pointer-events-none absolute inset-x-6 -bottom-2 h-2 rounded-full bg-black/10 blur-md opacity-30" />
  </div>
  );
}

