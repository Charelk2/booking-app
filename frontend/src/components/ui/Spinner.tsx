'use client';
import React from 'react';
import clsx from 'clsx';

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

export default function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }[size];

  return (
    <div
      {...props}
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={clsx('flex items-center justify-center', className)}
    >
      <span
        className={clsx(
          'animate-spin rounded-full border-2 border-current border-t-transparent',
          sizeClasses,
        )}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
