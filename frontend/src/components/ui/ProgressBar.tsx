'use client';
import React from 'react';
import clsx from 'clsx';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export default function ProgressBar({ value, className, ...props }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      {...props}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped}%`}
      className={clsx('w-full bg-gray-200 rounded h-2', className)}
    >
      <div className="bg-[var(--brand-color)] h-2 rounded" style={{ width: `${clamped}%` }} />
    </div>
  );
}
