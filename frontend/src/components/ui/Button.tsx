'use client';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

/**
 * TODO: Consider moving button variants to a central theme file
 * so colors and hover states remain consistent across the app.
 */
export default function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  const base =
    'rounded-md px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50';
  const variantClass =
    variant === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
      : variant === 'secondary'
      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400'
      : 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';

  return (
    <button type={props.type ?? 'button'} {...props} className={clsx(base, variantClass, className)} />
  );
}

