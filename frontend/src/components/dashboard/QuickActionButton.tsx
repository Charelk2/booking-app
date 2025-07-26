'use client';
import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';

interface QuickActionButtonProps {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export default function QuickActionButton({
  label,
  href,
  onClick,
  icon,
  className,
}: QuickActionButtonProps) {
  const content = (
    <span className="flex items-center gap-1">{icon}{label}</span>
  );
  const baseClass = clsx(
    'bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-3 rounded-lg text-sm font-medium transition',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={baseClass} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={baseClass} onClick={onClick}>
      {content}
    </button>
  );
}

