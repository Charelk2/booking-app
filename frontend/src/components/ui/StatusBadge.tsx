'use client';
import clsx from 'clsx';
import React from 'react';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

const styles: Record<StatusBadgeProps['status'], string> = {
  pending: 'bg-gray-100 text-gray-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-gray-200 text-gray-800',
};

export default function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        styles[status],
        className,
      )}
    >
      {children ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
