'use client';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {}

export default function Tag({ className, children, ...props }: TagProps) {
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-light text-brand-dark',
        className,
      )}
    >
      {children}
    </span>
  );
}
