'use client';
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {}

export default function Tag({ className, children, ...props }: TagProps) {
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center font-medium',
        className,
      )}
      style={{
        borderRadius: radii.pill,
        padding: `${spacing.xs} ${spacing.sm}`,
        fontSize: typography.tiny,
        backgroundColor: colors.neutral.bg,
        color: colors.brand.primary,
        border: `1px solid ${colors.neutral.border}`,
      }}
    >
      {children}
    </span>
  );
}
