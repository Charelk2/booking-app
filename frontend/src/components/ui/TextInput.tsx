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
            'block w-full rounded-lg border bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-brand-dark focus:ring-2 focus:ring-brand-dark sm:text-sm',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
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
