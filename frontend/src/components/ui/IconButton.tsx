'use client';
import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost';
  /**
   * Screen reader label describing the button's action.
   * Required so icon-only buttons remain accessible.
   */
  'aria-label': string;
}

export default function IconButton({
  variant = 'default',
  className,
  children,
  ...props
}: IconButtonProps) {
  if (
    process.env.NODE_ENV !== 'production' &&
    !props['aria-label']
  ) {
    console.warn('IconButton requires an aria-label for accessibility');
  }
  const base =
    'inline-flex h-11 w-11 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors motion-reduce:transition-none';
  const variantClass =
    variant === 'ghost'
      ? 'hover:bg-black/10 text-gray-600'
      : 'bg-white/60 hover:bg-white text-gray-700 shadow';
  return (
    <button
      type="button"
      {...props}
      className={clsx(base, variantClass, className)}
    >
      {children}
    </button>
  );
}
