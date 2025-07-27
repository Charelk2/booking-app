'use client';
import type { TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import clsx from 'clsx';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  loading?: boolean;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, id, error, loading = false, className, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          id={id}
          className={clsx(
            'block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)] sm:text-sm',
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
  ),
);
TextArea.displayName = 'TextArea';

export default TextArea;
