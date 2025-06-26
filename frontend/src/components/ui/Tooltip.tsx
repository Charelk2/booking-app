'use client';

import { useState, useId, type ReactNode } from 'react';
import clsx from 'clsx';

interface TooltipProps {
  text: string;
  children?: ReactNode;
  className?: string;
}

export default function Tooltip({ text, children = '?', className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={clsx('relative inline-block', className)}>
      <button
        type="button"
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-gray-500 cursor-help focus:outline-none"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-700 px-2 py-1 text-xs text-white z-10"
        >
          {text}
        </span>
      )}
    </span>
  );
}
