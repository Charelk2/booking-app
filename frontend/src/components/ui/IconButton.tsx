'use client';
import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost';
}

export default function IconButton({
  variant = 'default',
  className,
  children,
  ...props
}: IconButtonProps) {
  const base =
    'p-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';
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
