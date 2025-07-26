'use client';
import type { ReactNode } from 'react';
import clsx from 'clsx';

interface OverviewCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  className?: string;
}

export default function OverviewCard({ label, value, icon, className }: OverviewCardProps) {
  return (
    <div
      className={clsx(
        'flex items-center space-x-3 p-4 rounded-lg bg-white border border-gray-200 shadow-sm',
        className,
      )}
    >
      <div className="text-brand-dark">{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-lg font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
