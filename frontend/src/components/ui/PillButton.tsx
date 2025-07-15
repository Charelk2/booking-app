'use client';
import clsx from 'clsx';

export interface PillButtonProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export default function PillButton({ label, selected, onClick }: PillButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'h-10 px-4 mx-1 rounded-full font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-50 focus:ring-offset-default',
        selected
          ? 'bg-primary-600 text-white ring-0'
          : 'bg-white ring-1 ring-gray-200 text-gray-700 hover:bg-gray-100'
      )}
    >
      {label}
    </button>
  );
}
