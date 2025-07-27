'use client';
import React, { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { buttonVariants, type ButtonVariant } from '@/styles/buttonVariants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Small vs regular size */
  size?: 'sm' | 'md';
  /** Show loading spinner and disable button */
  isLoading?: boolean;
  /** Stretch button to full width (useful on mobile) */
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      className,
      children,
      ...props
    }: ButtonProps,
    ref,
  ) => {
    const sizeClass =
      size === 'sm'
        ? 'px-3 py-1.5 text-sm'
        : 'px-4 py-2 text-sm';
    const base =
      'inline-flex items-center justify-center rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 transition-transform transition-colors active:scale-95 min-h-12 min-w-12';
    const variantClass = buttonVariants[variant];
    return (
      <button
        type={props.type ?? 'button'}
        aria-busy={isLoading}
        disabled={isLoading || props.disabled}
        ref={ref}
        {...props}
        className={clsx(base, sizeClass, variantClass, fullWidth && 'w-full', className)}
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
  },
);
Button.displayName = 'Button';

export default Button;
