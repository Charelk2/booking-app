// src/components/layout/Hero.tsx
'use client';

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import SearchBar from '../search/SearchBar'; // ✨ Import your new component

// —————————— Custom Hook ——————————
const WORDS = ['Upcoming', 'Legendary', 'Local', 'Afrikaans'];

function useCycle<T>(items: T[], delay = 3000): T {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % items.length), delay);
    return () => clearInterval(id);
  }, [items, delay]);
  return items[idx];
}


// —————————— Main Hero Component ——————————
export default function Hero() {
  const [isModalOpen, setModalOpen] = useState(false);
  const word = useCycle(WORDS);

  return (
    <>
      <section className="bg-gradient-to-br from-indigo-50 to-indigo-100 py-16">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-8">
            Find and Book <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-400">{word}</span> Artists & More
          </h2>

          {/* ✨ This is the Airbnb-style trigger button */}
          <button
            onClick={() => setModalOpen(true)}
            className="w-full max-w-lg mx-auto h-16 flex items-center p-2 bg-white rounded-full shadow-lg text-left text-sm"
          >
            <div className="flex-1 px-4 font-semibold text-gray-800">
              Start your search
            </div>
            <div className="bg-pink-600 hover:bg-pink-700 p-3 rounded-full text-white ml-auto">
              <MagnifyingGlassIcon className="h-5 w-5" />
            </div>
          </button>
        </div>
      </section>

      {/* ✨ This modal opens on click and contains your SearchBar */}
      <Transition.Root show={isModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={setModalOpen}>
          {/* Overlay */}
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
          </Transition.Child>

          {/* Modal Content */}
          <div className="fixed inset-0 pt-8 px-4 overflow-y-auto">
            <div className="flex min-h-full items-start justify-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="relative w-full max-w-3xl mx-auto">
                  {/* Your new SearchBar component lives here! */}
                  <SearchBar />
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
}