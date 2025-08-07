'use client';

import { useState, useId, useRef } from 'react';
import clsx from 'clsx';
import type { ReactNode } from 'react';

interface InfoPopoverProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export default function InfoPopover({ label, children, className }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const labelId = `${popoverId}-label`;
  const descId = `${popoverId}-desc`;
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className={clsx('relative inline-block', className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={label}
        onClick={toggle}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            close();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            close();
            (e.currentTarget as HTMLButtonElement).blur();
          }
        }}
        className="text-black-600 cursor-pointer focus:outline-none"
      >
        ⓘ
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={labelId}
          aria-describedby={descId}
          className="absolute z-10 w-48 p-2 text-xs text-white bg-gray-800 rounded-md shadow-lg"
        >
          <p id={labelId} className="sr-only">
            {label}
          </p>
          <div id={descId}>{children}</div>
        </div>
      )}
    </div>
  );
}

