'use client';
import React from 'react';
import clsx from 'clsx';

export type AlertBannerVariant = 'success' | 'info' | 'error';

export interface AlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertBannerVariant;
}

export default function AlertBanner({
  variant = 'info',
  className,
  children,
  ...props
}: AlertBannerProps) {
  const variantClasses = {
    success: 'bg-green-50 border border-green-200 text-green-800',
    info: 'bg-blue-50 border border-blue-200 text-blue-800',
    error: 'bg-red-50 border border-red-200 text-red-800',
  }[variant];

  return (
    <div
      {...props}
      role="alert"
      className={clsx('rounded-lg p-4 text-sm', variantClasses, className)}
    >
      {children}
    </div>
  );
}
