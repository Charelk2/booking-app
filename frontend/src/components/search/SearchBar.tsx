'use client';

import { useState, useEffect, forwardRef, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactDatePicker from 'react-datepicker';
import '@/styles/datepicker.css';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronDownIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import LocationInput from '../ui/LocationInput';
import { ReactDatePickerCustomHeaderProps } from 'react-datepicker';
import {
  UI_CATEGORIES,
  UI_CATEGORY_TO_SERVICE,
  SERVICE_TO_UI_CATEGORY,
} from '@/lib/categoryMap';

type Category = (typeof UI_CATEGORIES)[number];

interface SearchBarProps { compact?: boolean; }
interface FormFieldsProps {
  category: Category;
  setCategory: (c: Category) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
}

const SearchFields = forwardRef<HTMLDivElement, FormFieldsProps>(
  ({ category, setCategory, location, setLocation, when, setWhen }, _ref) => (
    <>
      {/* Category */}
      <div className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">Category</span>
        <Listbox value={category} onChange={setCategory}>
          <div className="relative w-full">
            <Listbox.Button className="mt-1 w-full flex justify-between items-center text-sm text-gray-700 focus:outline-none">
              <span>{category.label}</span>
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            </Listbox.Button>
            <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0">
              <Listbox.Options className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                {UI_CATEGORIES.map((c) => (
                  <Listbox.Option
                    key={c.value}
                    value={c}
                    className={({ active }) =>
                      clsx('px-4 py-2 text-sm cursor-pointer', active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700')
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
      <div className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">Where</span>
        <LocationInput
          value={location}
          onValueChange={setLocation}
          onPlaceSelect={() => {}}
          placeholder="City or venue"
        />
      </div>

      <div className="border-l border-gray-200" />

      {/* When */}
      <div className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">When</span>
        <ReactDatePicker
          selected={when}
          onChange={(d: Date | null) => setWhen(d)}
          dateFormat="MMM d, yyyy"
          placeholderText="Add date"
          className="mt-1 w-full text-sm text-gray-700 focus:outline-none"
          renderCustomHeader={({ date, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }: ReactDatePickerCustomHeaderProps) => (
            <div className="flex justify-between items-center px-3 pt-2 pb-2">
              <button onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="p-1 rounded-full hover:bg-gray-100">
                <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
              </button>
              <span className="text-base font-semibold text-gray-900">
                {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="p-1 rounded-full hover:bg-gray-100">
                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          )}
        />
      </div>
    </>
  )
);
SearchFields.displayName = 'SearchFields';

export { SearchFields };

export default function SearchBar({ compact = false }: SearchBarProps) {
  const [category, setCategory] = useState<Category>(UI_CATEGORIES[0]);
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) {
      const mapped = SERVICE_TO_UI_CATEGORY[catParam] || catParam;
      const found = UI_CATEGORIES.find((c) => c.value === mapped);
      if (found) setCategory(found);
    }
    const locParam = searchParams.get('location');
    if (locParam) setLocation(locParam);
    const whenParam = searchParams.get('when');
    if (whenParam) {
      const d = new Date(whenParam);
      if (!Number.isNaN(d.getTime())) setWhen(d);
    }
  }, [searchParams]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (category) {
      const mapped = UI_CATEGORY_TO_SERVICE[category.value] || category.value;
      params.set('category', mapped);
    }
    if (location) params.set('location', location);
    if (when) params.set('when', when.toISOString());
    const qs = params.toString();
    router.push(qs ? `/artists?${qs}` : '/artists');
  };

  return (
    // Added a wrapper div for width control and centering
    <div className="max-w-4xl mx-auto my-4"> {/* Adjust max-w-3xl as needed */}
      <div className={clsx('flex items-stretch bg-white rounded-full shadow-lg overflow-visible', compact && 'text-sm')}>
        <SearchFields
          category={category}
          setCategory={setCategory}
          location={location}
          setLocation={setLocation}
          when={when}
          setWhen={setWhen}
        />
        <button
          type="button"
          onClick={handleSearch}
          className="bg-pink-600 hover:bg-pink-700 px-5 py-3 flex items-center justify-center text-white rounded-r-full"
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
          <span className="sr-only">Search</span>
        </button>
      </div>
    </div>
  );
}
