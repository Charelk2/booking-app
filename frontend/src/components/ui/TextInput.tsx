'use client';
import type { InputHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import clsx from 'clsx';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  loading?: boolean;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, id, error, loading = false, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-2 focus:border-[#FF5A5F] sm:text-sm',
            error && 'border-red-500',
            className,
          )}
          {...props}
        />
        {loading && (
          <span className="absolute inset-y-0 right-2 flex items-center" aria-label="Loading">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
});
TextInput.displayName = 'TextInput';

export default TextInput;
