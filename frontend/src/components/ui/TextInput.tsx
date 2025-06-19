'use client';
import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  loading?: boolean;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, id, error, loading = false, className, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="mt-1 relative">
        <input
          ref={ref}
          id={id}
          className={clsx(
            'block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm',
            className,
          )}
          {...props}
        />
        {loading && (
          <span className="absolute inset-y-0 right-2 flex items-center" aria-label="Loading">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  ),
);
TextInput.displayName = 'TextInput';

export default TextInput;
