'use client';

import { useRef, KeyboardEvent } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { SearchFields, type Category } from './SearchFields';
import useClickOutside from '@/hooks/useClickOutside';

export interface SearchBarProps {
  category: Category;
  setCategory: (c: Category) => void;
  location: string;
  setLocation: (l: string) => void;
  when: Date | null;
  setWhen: (d: Date | null) => void;
  onSearch: (params: { category: string; location?: string; when?: Date | null }) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function SearchBar({
  category,
  setCategory,
  location,
  setLocation,
  when,
  setWhen,
  onSearch,
  onCancel,
  compact = false,
}: SearchBarProps) {
  const formRef = useRef<HTMLFormElement>(null);
  useClickOutside(formRef, () => {
    if (onCancel) onCancel();
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      category: category.value,
      location: location || undefined,
      when,
    });
  };

  return (
    <form
      ref={formRef}
      onKeyDown={handleKeyDown}
      onSubmit={handleSubmit}
      className={clsx(
        'flex items-stretch bg-white rounded-full shadow-lg overflow-visible',
        compact && 'text-sm',
      )}
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
        className="bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 px-5 py-3 flex items-center justify-center text-white rounded-r-full"
      >
        <MagnifyingGlassIcon className="h-5 w-5" />
        <span className="sr-only">Search</span>
      </button>
    </form>
  );
}
