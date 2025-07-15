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
        'h-10 px-4 mx-1 rounded-full font-medium transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1',
        selected
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
      )}
    >
      {label}
    </button>
  );
}
