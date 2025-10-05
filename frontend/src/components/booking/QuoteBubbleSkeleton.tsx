'use client';

import React from 'react';
import clsx from 'clsx';

interface QuoteBubbleSkeletonProps {}

const shimmer = 'animate-pulse bg-gray-100';

export default function QuoteBubbleSkeleton({}: QuoteBubbleSkeletonProps) {
  // Always render on the left and match QuoteBubble's width and container style
  const bubbleClasses = clsx(
    'rounded-xl px-3 py-2 w-full md:w-1/2 lg:w-1/2 space-y-3 shadow-sm',
    'bg-white border border-gray-200 text-left mr-auto'
  );

  return (
    <div className={bubbleClasses} aria-hidden="true">
      {/* Header line and subline */}
      <div className={clsx('h-4 w-2/5 rounded', shimmer)} />
      <div className={clsx('h-3 w-1/3 rounded', shimmer)} />
      {/* Chips / meta */}
      <div className="flex gap-2">
        <div className={clsx('h-4 w-14 rounded', shimmer)} />
        <div className={clsx('h-4 w-10 rounded', shimmer)} />
        <div className={clsx('h-4 w-20 rounded', shimmer)} />
      </div>
      {/* Line items */}
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className={clsx('h-3 w-1/3 rounded', shimmer)} />
            <div className={clsx('h-3 w-16 rounded', shimmer)} />
          </div>
        ))}
      </div>
      {/* Total bar */}
      <div className={clsx('h-9 rounded-lg', shimmer)} />
    </div>
  );
}
