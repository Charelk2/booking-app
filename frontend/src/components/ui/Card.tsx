'use client';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import { colors, radii, spacing } from '@/theme/tokens';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Display a loading state overlay */
  loading?: boolean;
  variant?: 'default' | 'wizard' | 'flat';
}

export default function Card({
  loading = false,
  variant = 'default',
  className,
  children,
  ...props
}: CardProps) {
  const base =
    variant === 'wizard'
      ? 'shadow-xl p-8 max-w-md mx-auto'
      : variant === 'flat'
        ? 'relative'
        : 'border shadow-sm transition-shadow hover:shadow-md relative';
  const surfaceStyles =
    variant === 'wizard'
      ? {
          backgroundColor: colors.brand.surface,
          borderRadius: radii.card,
          border: `1px solid ${colors.neutral.border}`,
        }
      : variant === 'flat'
      ? {
          backgroundColor: colors.brand.surface,
          borderRadius: radii.md,
        }
      : {
          backgroundColor: colors.brand.surface,
          borderRadius: radii.md,
          border: `1px solid ${colors.neutral.border}`,
        };
  return (
    <div {...props} className={clsx(base, className)} style={surfaceStyles}>
      {loading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10" aria-label="Loading">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-dark border-t-transparent" />
        </div>
      )}
      <div className={clsx(loading && 'opacity-50')} style={{ padding: variant === 'wizard' ? spacing.lg : undefined }}>
        {children}
      </div>
    </div>
  );
}
