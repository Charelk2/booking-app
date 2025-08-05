'use client';
import { useId } from 'react';
import clsx from 'clsx';

interface CollapsibleSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export default function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  children,
  className,
  testId,
}: CollapsibleSectionProps) {
  const contentId = useId();

  return (
    <section className={clsx('bg-white rounded-lg shadow-md', className)} data-testid={testId}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="w-full p-4 min-h-[44px] text-left border-b flex justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="flex flex-col">
            <span className="font-bold">{title}</span>
            {description && (
              <span className="text-sm font-normal text-gray-600 pt-1">
                {description}
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={clsx('ml-2 transition-transform', open ? 'rotate-180' : 'rotate-0')}
          >
            {'›'}
          </span>
        </button>
      </h3>
      <div id={contentId} hidden={!open} className="p-6 space-y-6">
        {children}
      </div>
    </section>
  );
}
