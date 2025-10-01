'use client';

import React from 'react';
import clsx from 'clsx';

interface BookingSummarySkeletonProps {
  /**
   * When rendered inside the modal we want a taller skeleton to mirror the
   * full height layout. Inline (desktop panel) can be slightly shorter.
   */
  variant?: 'modal' | 'inline';
}

const shimmer = 'animate-pulse bg-gray-100';

export default function BookingSummarySkeleton({ variant = 'inline' }: BookingSummarySkeletonProps) {
  const containerClasses = clsx(
    'rounded-2xl border border-gray-200 bg-white shadow-sm p-4 md:p-5 flex flex-col',
    variant === 'modal' ? 'min-h-[280px] md:min-h-[420px]' : 'min-h-[240px]'
  );

  return (
    <div className={containerClasses} aria-hidden="true">
      <div className="flex items-center gap-4">
        <div className={clsx('h-16 w-16 rounded-xl', shimmer)} />
        <div className="flex-1 space-y-2">
          <div className={clsx('h-4 w-2/3 rounded', shimmer)} />
          <div className={clsx('h-3 w-1/2 rounded', shimmer)} />
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className={clsx('h-3 w-1/3 rounded', shimmer)} />
            <div className={clsx('h-10 rounded-lg', shimmer)} />
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6 space-y-3">
        <div className={clsx('h-3 w-1/4 rounded', shimmer)} />
        <div className={clsx('h-14 rounded-xl', shimmer)} />
      </div>
    </div>
  );
}
