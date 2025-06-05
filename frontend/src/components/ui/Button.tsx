'use client';
import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';
import { buttonVariants, type ButtonVariant } from '@/styles/buttonVariants';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export default function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) {
  const base =
    'rounded-md px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 transition-transform active:scale-95';
  const variantClass = buttonVariants[variant];

  return (
    <button type={props.type ?? 'button'} {...props} className={clsx(base, variantClass, className)} />
  );
}

