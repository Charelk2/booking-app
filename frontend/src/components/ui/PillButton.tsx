'use client';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  selected?: boolean;
}

export default function PillButton({
  label,
  selected = false,
  className,
  ...props
}: PillButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={clsx(
        'inline-flex items-center justify-center h-10 px-4 mx-1 rounded-full font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1',
        selected
          ? 'bg-indigo-600 text-white'
          : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100',
        className,
      )}
    >
      {label}
    </button>
  );
}
