// src/components/layout/Hero.tsx
'use client';

import { useState, useEffect, forwardRef, Fragment } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import { Listbox, Transition, Dialog } from '@headlessui/react';
import {
  CalendarIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

// ————— constants —————
const WORDS = ['Upcoming', 'Legendary', 'Local', 'Afrikaans'];
const CATEGORIES = [
  { value: 'musician', label: 'Musician / Band' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'dj', label: 'DJ' },
  { value: 'venue', label: 'Venue' },
];
type Category = typeof CATEGORIES[number];


// ————— cycle hook —————
function useCycle<T>(items: T[], delay = 3000): T {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), delay);
    return () => clearInterval(id);
  }, [items, delay]);
  return items[idx];
}

interface FormFieldsProps {
  category: Category;
  setCategory: (c: Category) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
}

// ————— Search fields (no icons, with dividers) —————
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
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                {CATEGORIES.map(c => (
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
      <div className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">Where</span>
        <input
          type="text"
          placeholder="City or venue"
          value={location}
          onChange={e => setLocation(e.target.value)}
          className="mt-1 w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
        />
      </div>

      <div className="border-l border-gray-200" />

      {/* When */}
      <div className="flex-1 px-4 py-3 flex flex-col text-left">
        <span className="text-xs text-gray-500">When</span>
        <ReactDatePicker
          selected={when}
          onChange={d => setWhen(d)}
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

// ————— Hero component —————
interface HeroProps {
  variant?: 'withForm' | 'plain';
}

export default function Hero({ variant = 'withForm' }: HeroProps) {
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [location, setLocation] = useState('');
  const [when, setWhen] = useState<Date | null>(null);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const word = useCycle(WORDS);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) {
      const found = CATEGORIES.find((c) => c.value === catParam);
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
    if (category) params.set('category', category.value);
    if (location) params.set('location', location);
    if (when) params.set('when', when.toISOString());
    const qs = params.toString();
    router.push(qs ? `/artists?${qs}` : '/artists');
    setMobileOpen(false);
  };

  return (
    <>
      <section className="bg-gradient-to-br from-indigo-50 to-indigo-100 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-8">
            Find and Book{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-400 inline-block animate-flash">
              {word}
            </span>{' '}
            Artists & More
          </h2>

          {variant === 'withForm' && (
            <>
              {/* Desktop */}
              <form
                onSubmit={onSubmit}
                className="hidden sm:flex items-stretch bg-white rounded-full shadow-lg overflow-visible"
              >
                <SearchFields
                  category={category}
                  setCategory={setCategory}
                  location={location}
                  setLocation={setLocation}
                  when={when}
                  setWhen={setWhen}
                />
                <button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-700 px-5 py-3 flex items-center justify-center text-white"
                >
                  <MagnifyingGlassIcon className="h-5 w-5" />
                  <span className="sr-only">Search</span>
                </button>
              </form>

              {/* Mobile trigger */}
              <div className="sm:hidden px-4">
                <button
                  onClick={() => setMobileOpen(true)}
                  className="w-full flex items-center p-3 bg-white rounded-full shadow-lg"
                >
                  <MagnifyingGlassIcon className="h-6 w-6 text-gray-700 mr-3" />
                  <div className="text-left">
                    <p className="font-medium text-gray-800">Start your search</p>
                    <p className="text-xs text-gray-500">Artists, venues, & more</p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <style jsx>{`
          .animate-flash {
            animation: flashText 1.5s ease-in-out infinite;
          }
          @keyframes flashText {
            0%,100% { opacity: 0.5; transform: translateY(2px) scale(0.98); }
            50%    { opacity: 1;   transform: translateY(0)  scale(1.02); }
          }
        `}</style>
      </section>

      {/* Mobile modal */}
      {variant === 'withForm' && (
        <Transition.Root show={isMobileOpen} as={Fragment}>
          <Dialog as="div" className="fixed inset-0 z-40 sm:hidden" onClose={setMobileOpen}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 bg-black bg-opacity-40" />
          </Transition.Child>
          <div className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="bg-gray-50 rounded-2xl shadow-xl max-w-md w-full transform transition-all">
                <div className="flex justify-end p-2">
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="p-2 rounded-full hover:bg-gray-200"
                  >
                    <XMarkIcon className="h-5 w-5 text-gray-700" />
                  </button>
                </div>
                <form onSubmit={onSubmit} className="space-y-4 px-4 pb-4 bg-white rounded-xl shadow divide-y divide-gray-200">
                  <SearchFields
                    category={category}
                    setCategory={setCategory}
                    location={location}
                    setLocation={setLocation}
                    when={when}
                    setWhen={setWhen}
                  />
                  <button
                    type="submit"
                    className="w-full flex justify-center items-center gap-2 bg-pink-600 hover:bg-pink-700 px-4 py-3 rounded-lg text-white font-semibold"
                  >
                    <MagnifyingGlassIcon className="h-5 w-5" />
                    Search
                  </button>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
        </Transition.Root>
      )}
    </>
  );
}
