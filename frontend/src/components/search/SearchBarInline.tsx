'use client';
import { useState, useEffect, Fragment } from 'react';
import { Popover, Transition, Listbox } from '@headlessui/react';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import ReactDatePicker, {
  ReactDatePickerCustomHeaderProps,
} from 'react-datepicker';
import LocationInput from '../ui/LocationInput';
import '@/styles/datepicker.css';
import clsx from 'clsx';
import {
  UI_CATEGORIES,
} from '@/lib/categoryMap';

type Category = (typeof UI_CATEGORIES)[number];

interface Props {
  categoryLabel?: string;
  categoryValue?: string;
  location?: string;
  when?: Date | null;
  onSearchEdit: (p: {
    category?: string;
    location?: string;
    when?: Date | null;
  }) => void;
}

export default function SearchBarInline({
  categoryLabel,
  categoryValue,
  location,
  when,
  onSearchEdit,
}: Props) {
  const initialCat = categoryValue
    ? UI_CATEGORIES.find((c) => c.value === categoryValue) || UI_CATEGORIES[0]
    : UI_CATEGORIES[0];
  const [category, setCategory] = useState<Category>(initialCat);
  const [loc, setLoc] = useState(location || '');
  const [date, setDate] = useState<Date | null>(when || null);

  useEffect(() => {
    if (categoryValue) {
      const found = UI_CATEGORIES.find((c) => c.value === categoryValue);
      if (found) setCategory(found);
    }
    setLoc(location || '');
    setDate(when || null);
  }, [categoryValue, location, when]);

  return (
    <div className="flex items-center rounded-full shadow-sm divide-x bg-white">
      <Popover as="div" className="relative flex-1">
        {({ close }) => (
          <>
            <Popover.Button className="w-full text-left px-4 py-2 flex items-center justify-between">
              <span className="text-sm">
                {categoryLabel || 'All'}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
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
              <Popover.Panel className="absolute z-20 mt-2 w-48 bg-white rounded-lg shadow-lg p-2">
                <Listbox value={category} onChange={setCategory}>
                  <div className="relative">
                    <Listbox.Button className="sr-only">Category</Listbox.Button>
                    <Listbox.Options className="max-h-60 overflow-auto py-1">
                      {UI_CATEGORIES.map((c) => (
                        <Listbox.Option
                          key={c.value}
                          value={c}
                          className={({ active }) =>
                            clsx(
                              'px-4 py-2 text-sm cursor-pointer',
                              active ? 'bg-indigo-100 text-indigo-900' : 'text-gray-700',
                            )
                          }
                        >
                          {c.label}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </div>
                </Listbox>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onSearchEdit({
                        category: category.value,
                        location: loc || undefined,
                        when: date,
                      });
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Apply
                  </button>
                </div>
              </Popover.Panel>
            </Transition>
          </>
        )}
      </Popover>
      <Popover as="div" className="relative flex-1">
        {({ close }) => (
          <>
            <Popover.Button className="w-full text-left px-4 py-2 flex items-center justify-between">
              <span className="text-sm">
                {loc || 'Anywhere'}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
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
              <Popover.Panel className="absolute z-20 mt-2 w-80 bg-white rounded-lg shadow-lg p-2">
                <LocationInput
                  value={loc}
                  onValueChange={setLoc}
                  onPlaceSelect={() => {}}
                  inputClassName="w-full border border-gray-200 rounded-md p-2"
                />
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onSearchEdit({
                        category: category.value,
                        location: loc || undefined,
                        when: date,
                      });
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Apply
                  </button>
                </div>
              </Popover.Panel>
            </Transition>
          </>
        )}
      </Popover>
      <Popover as="div" className="relative flex-1">
        {({ close }) => (
          <>
            <Popover.Button className="w-full text-left px-4 py-2 flex items-center justify-between">
              <span className="text-sm">
                {date ? date.toLocaleDateString() : 'Add date'}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
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
              <Popover.Panel className="absolute z-20 mt-2 bg-white rounded-lg shadow-lg p-2">
                <ReactDatePicker
                  selected={date}
                  onChange={setDate}
                  inline
                  renderCustomHeader={({
                    date: d,
                    decreaseMonth,
                    increaseMonth,
                    prevMonthButtonDisabled,
                    nextMonthButtonDisabled,
                  }: ReactDatePickerCustomHeaderProps) => (
                    <div className="flex justify-between items-center px-3 pt-2 pb-2">
                      <button
                        onClick={decreaseMonth}
                        disabled={prevMonthButtonDisabled}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
                      </button>
                      <span className="text-base font-semibold text-gray-900">
                        {d.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={increaseMonth}
                        disabled={nextMonthButtonDisabled}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                      </button>
                    </div>
                  )}
                />
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onSearchEdit({
                        category: category.value,
                        location: loc || undefined,
                        when: date,
                      });
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Apply
                  </button>
                </div>
              </Popover.Panel>
            </Transition>
          </>
        )}
      </Popover>
      <button
        type="button"
        onClick={() =>
          onSearchEdit({ category: category.value, location: loc || undefined, when: date })
        }
        className="p-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-full ml-2 mr-2"
      >
        <MagnifyingGlassIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
