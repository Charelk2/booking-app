// src/components/search/SearchBarInline.tsx
'use client';

import React from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

// These types are no longer directly used in this simplified component,
// but kept for context if needed elsewhere.
// import type { Category } from '@/lib/categoryMap'; // Or from SearchFields
// type SearchParams = { category?: string; location?: string; when?: Date | null };

interface SearchBarInlineProps {
  // No props needed here anymore, as its click handler is in Header.tsx
  // to directly control the header state.
}

// NOTE: This component is simplified to ONLY render the pill.
// Its behavior of expanding is handled by the Header component now.
export default function SearchBarInline({}: SearchBarInlineProps) {
  return (
    <div className="flex-1 px-4 py-2 border border-gray-300 rounded-full shadow-sm hover:shadow-md cursor-pointer flex items-center justify-between text-sm transition-all duration-200">
      <span className="text-gray-500">Category, Location, When</span>
      <MagnifyingGlassIcon className="h-5 w-5 text-gray-500" />
    </div>
  );
}