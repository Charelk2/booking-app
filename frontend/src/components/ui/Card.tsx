'use client';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Display a loading state overlay */
  loading?: boolean;
}

export default function Card({
  loading = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={clsx(
        'bg-white rounded-lg border border-gray-200 shadow-sm transition-shadow hover:shadow-md relative',
        className,
      )}
    >
      {loading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10" aria-label="Loading">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
        </div>
      )}
      <div className={clsx(loading && 'opacity-50')}>{children}</div>
    </div>
  );
}
