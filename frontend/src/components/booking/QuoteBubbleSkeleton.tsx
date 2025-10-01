'use client';

import React from 'react';
import clsx from 'clsx';

interface QuoteBubbleSkeletonProps {
  align?: 'left' | 'right';
}

const shimmer = 'animate-pulse bg-gray-100';

export default function QuoteBubbleSkeleton({ align = 'left' }: QuoteBubbleSkeletonProps) {
  const bubbleClasses = clsx(
    'rounded-2xl px-3 py-3 max-w-[260px] space-y-3 shadow-sm',
    align === 'right' ? 'bg-indigo-50 text-right ml-auto' : 'bg-white border border-gray-200 text-left mr-auto'
  );

  return (
    <div className={bubbleClasses} aria-hidden="true">
      <div className={clsx('h-4 w-2/3 rounded', shimmer)} />
      <div className={clsx('h-3 w-1/2 rounded', shimmer)} />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className={clsx('h-3 w-1/3 rounded', shimmer)} />
            <div className={clsx('h-3 w-1/4 rounded', shimmer)} />
          </div>
        ))}
      </div>
      <div className={clsx('h-10 rounded-lg', shimmer)} />
    </div>
  );
}
