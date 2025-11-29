"use client";

import React from 'react';
import { colors, radii, spacing, typography } from '@/theme/tokens';

type Props = {
  children: React.ReactNode;
  leadingIcon?: React.ReactNode;
  className?: string;
};

export default function Chip({ children, leadingIcon, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 border shadow-sm ${className}`}
      style={{
        borderRadius: radii.pill,
        borderColor: colors.neutral.border,
        backgroundColor: colors.neutral.bg,
        color: colors.neutral.text,
        padding: `${spacing.xs} ${spacing.md}`,
        fontSize: typography.small,
        fontWeight: 600,
      }}
    >
      {leadingIcon}
      {children}
    </span>
  );
}
