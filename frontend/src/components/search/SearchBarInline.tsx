'use client';
import { useState, useEffect, Fragment, KeyboardEvent } from 'react';
import { Popover, Transition, Listbox } from '@headlessui/react';
import {
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import ReactDatePicker from 'react-datepicker';
import type { ReactDatePickerCustomHeaderProps } from 'react-datepicker';
import LocationInput from '../ui/LocationInput';
import '@/styles/datepicker.css';
import clsx from 'clsx';
import { UI_CATEGORIES } from '@/lib/categoryMap';
import { format } from 'date-fns';

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

  const applyAndClose = (close: () => void) => {
    close();
    onSearchEdit({
      category: category.value,
      location: loc || undefined,
      when: date,
    });
  };

  const handleKey = (
    e: KeyboardEvent,
    close: () => void,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyAndClose(close);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="flex items-stretch bg-white border border-gray-200 rounded-full shadow-sm divide-x divide-gray-200 overflow-visible">
      <Popover as="div" className="relative flex-1">
        {({ close }) => (
          <>
            <Popover.Button className="flex-none px-4 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none">
              <span>{categoryLabel || 'All'}</span>
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
              <Popover.Panel
                className="
                  absolute z-50 left-0 top-full mt-2
                  w-full bg-white rounded-lg shadow-xl p-4
                "
                onKeyDown={(e) => handleKey(e, close)}
              >
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
                    onClick={() => applyAndClose(close)}
                    className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-full"
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
            <Popover.Button className="flex-none px-4 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none">
              <span>{loc || 'Anywhere'}</span>
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
              <Popover.Panel
                className="
                  absolute z-50 left-0 top-full mt-2
                  w-full bg-white rounded-lg shadow-xl p-4
                "
                onKeyDown={(e) => handleKey(e, close)}
              >
                <LocationInput
                  value={loc}
                  onValueChange={setLoc}
                  onPlaceSelect={() => {}}
                  className="w-full"
                  inputClassName="w-full"
                />
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => applyAndClose(close)}
                    className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-full"
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
            <Popover.Button className="flex-none px-4 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none">
              <span>{date ? format(date, 'd MMM yyyy') : 'Add date'}</span>
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
              <Popover.Panel
                className="
                  absolute z-50 left-0 top-full mt-2
                  w-full bg-white rounded-lg shadow-xl p-4
                "
                onKeyDown={(e) => handleKey(e, close)}
              >
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
                    onClick={() => applyAndClose(close)}
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
        className="bg-pink-600 hover:bg-pink-700 px-4 py-2 flex items-center justify-center text-white rounded-r-full"
      >
        <MagnifyingGlassIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
