'use client';
import React from 'react';
import clsx from 'clsx';

export interface SkeletonListProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export default function SkeletonList({ lines = 5, className, ...props }: SkeletonListProps) {
  return (
    <div
      {...props}
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={clsx('space-y-3', className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
