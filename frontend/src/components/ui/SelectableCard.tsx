'use client';
import { forwardRef, InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface SelectableCardProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

const SelectableCard = forwardRef<HTMLInputElement, SelectableCardProps>(
  ({ label, className, ...props }, ref) => (
    <label className="block cursor-pointer">
      <input
        {...props}
        ref={ref}
        type="radio"
        className="peer sr-only"
      />
      <div
        className={clsx(
          'flex items-center justify-center rounded-lg border border-gray-300 bg-white p-4 text-sm transition-all',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-color)]',
          'peer-checked:border-[var(--brand-color)] peer-checked:bg-brand-light',
          'hover:bg-gray-50',
          className,
        )}
      >
        {label}
      </div>
    </label>
  ),
);
SelectableCard.displayName = 'SelectableCard';

export default SelectableCard;
