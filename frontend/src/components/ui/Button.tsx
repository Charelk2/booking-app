'use client';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { buttonVariants, type ButtonVariant } from '@/styles/buttonVariants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Show loading spinner and disable button */
  isLoading?: boolean;
  /** Stretch button to full width (useful on mobile) */
  fullWidth?: boolean;
}

export default function Button({
  variant = 'primary',
  isLoading = false,
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 transition-transform active:scale-95';
  const variantClass = buttonVariants[variant];

  return (
    <button
      type={props.type ?? 'button'}
      aria-busy={isLoading}
      disabled={isLoading || props.disabled}
      {...props}
      className={clsx(base, variantClass, fullWidth && 'w-full', className)}
    >
      {isLoading && (
        <span
          className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      <span className={clsx(isLoading && 'opacity-75')}>{children}</span>
    </button>
  );
}

