'use client';
import React, { forwardRef, type ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { buttonVariants, buttonBaseStyle, type ButtonVariant } from '@/styles/buttonVariants';
import { trackEvent } from '@/lib/analytics';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Small vs regular size */
  size?: 'sm' | 'md';
  /** Show loading spinner and disable button */
  isLoading?: boolean;
  /** Stretch button to full width (useful on mobile) */
  fullWidth?: boolean;
  /** Optional analytics event name */
  analyticsEvent?: string;
  /** Optional analytics payload */
  analyticsProps?: Record<string, unknown>;
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
      analyticsEvent,
      analyticsProps,
      onClick,
      ...props
    }: ButtonProps,
    ref,
  ) => {
    const sizeStyle =
      size === 'sm'
        ? { padding: '6px 12px', fontSize: '13px' }
        : { padding: '8px 16px', fontSize: '14px' };
    const baseClass =
      'inline-flex items-center justify-center focus:outline-none disabled:opacity-50 motion-safe:transition-transform motion-safe:transition-colors motion-safe:active:scale-95 motion-reduce:transition-none motion-reduce:transform-none';
    const variantDef = buttonVariants[variant];
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (analyticsEvent) trackEvent(analyticsEvent, analyticsProps);
      onClick?.(e);
    };

    return (
      <button
        type={props.type ?? 'button'}
        aria-busy={isLoading}
        disabled={isLoading || props.disabled}
        ref={ref}
        {...props}
        onClick={handleClick}
        className={clsx(baseClass, variantDef.className, fullWidth && 'w-full', className)}
        style={{
          ...buttonBaseStyle,
          ...sizeStyle,
          ...variantDef.style,
          ...(props.style || {}),
        }}
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
