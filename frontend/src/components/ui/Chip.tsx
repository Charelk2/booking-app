"use client";

import React from 'react';

type Props = {
  children: React.ReactNode;
  leadingIcon?: React.ReactNode;
  className?: string;
};

export default function Chip({ children, leadingIcon, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/70 px-2.5 py-1 text-xs text-gray-700 shadow-sm ${className}`}>
      {leadingIcon}
      {children}
    </span>
  );
}

