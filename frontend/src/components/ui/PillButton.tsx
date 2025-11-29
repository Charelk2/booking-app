'use client';
import clsx from 'clsx';
import { colors, radii, spacing, typography } from '@/theme/tokens';

export interface PillButtonProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

export default function PillButton({ label, selected, onClick }: PillButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        'h-11 mx-1 font-medium cursor-pointer focus:outline-none motion-safe:transition-colors motion-reduce:transition-none',
        selected ? 'text-white' : 'hover:bg-gray-100'
      )}
      style={{
        borderRadius: radii.pill,
        padding: `0 ${spacing.md}`,
        border: `1px solid ${selected ? colors.brand.primary : colors.neutral.border}`,
        backgroundColor: selected ? colors.brand.primary : '#FFFFFF',
        color: selected ? '#FFFFFF' : colors.neutral.text,
        fontSize: typography.body,
      }}
    >
      {label}
    </button>
  );
}
