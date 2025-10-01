'use client';

import React from 'react';
import clsx from 'clsx';

interface EventPrepSkeletonProps {
  summaryOnly?: boolean;
}

const shimmer = 'animate-pulse bg-gray-100';

export default function EventPrepSkeleton({ summaryOnly = false }: EventPrepSkeletonProps) {
  const wrapperClasses = summaryOnly
    ? 'rounded-xl border border-gray-200 bg-white px-3 py-3'
    : 'rounded-2xl border border-gray-200 bg-white px-4 py-5 shadow-sm';

  return (
    <section className={wrapperClasses} aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className={clsx('h-6 w-6 rounded-full', shimmer)} />
        <div className="flex-1 space-y-2">
          <div className={clsx('h-3 w-1/2 rounded', shimmer)} />
          <div className={clsx('h-3 w-1/3 rounded', shimmer)} />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className={clsx('h-8 w-8 rounded-full', shimmer)} />
            <div className="flex-1 space-y-1.5">
              <div className={clsx('h-3 w-1/2 rounded', shimmer)} />
              <div className={clsx('h-3 w-2/3 rounded', shimmer)} />
            </div>
            <div className={clsx('h-4 w-10 rounded-full', shimmer)} />
          </div>
        ))}
      </div>
    </section>
  );
}
