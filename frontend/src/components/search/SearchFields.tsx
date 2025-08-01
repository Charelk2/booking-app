'use client';

import { forwardRef, Fragment } from 'react';
import ReactDatePicker from 'react-datepicker';

import '../../styles/datepicker.css';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import LocationInput from '../ui/LocationInput';
import { UI_CATEGORIES } from '@/lib/categoryMap';


export type Category = (typeof UI_CATEGORIES)[number];

export interface SearchFieldsProps {
  category: Category | null;
  setCategory: (c: Category | null) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
}

type CustomHeaderProps = typeof import('react-datepicker')['ReactDatePickerCustomHeaderProps'];

export const SearchFields = forwardRef<HTMLDivElement, SearchFieldsProps>(
  ({ category, setCategory, location, setLocation, when, setWhen }, ref) => {
    return (
      <>
        {/* Category */}
        <div ref={ref} className="flex-1 px-4 py-3 flex flex-col text-left">
          <span className="text-xs text-gray-500">Category</span>
          <Listbox value={category} onChange={setCategory}>
            <div className="relative w-full">
              <Listbox.Button className="mt-1 w-full text-sm bg-transparent focus:outline-none flex items-center">
                <span
                  className={clsx(
                    'w-full text-left',
                    { 'text-gray-400': category === null },
                    { 'text-gray-700': category !== null }
                  )}
                >
                  {category ? category.label : 'Choose category'}
                </span>
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
            inputClassName="w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none"
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
            className="mt-1 w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none"
            renderCustomHeader={({
              date,
              decreaseMonth,
              increaseMonth,
              prevMonthButtonDisabled,
              nextMonthButtonDisabled,
            }: CustomHeaderProps) => (
              <div className="flex justify-between items-center px-3 pt-2 pb-2">
                <button
                  onClick={(e) => {
                    e.preventDefault(); // Prevent default button behavior
                    e.stopPropagation(); // <--- CRITICAL FIX: Stop event from bubbling up
                    decreaseMonth();
                  }}
                  disabled={prevMonthButtonDisabled}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
                </button>
                <span className="text-base font-semibold text-gray-900">
                  {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault(); // Prevent default button behavior
                    e.stopPropagation(); // <--- CRITICAL FIX: Stop event from bubbling up
                    increaseMonth();
                  }}
                  disabled={nextMonthButtonDisabled}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            )}
          />
        </div>
      </>
    );
  }
);
SearchFields.displayName = 'SearchFields';

export default SearchFields;