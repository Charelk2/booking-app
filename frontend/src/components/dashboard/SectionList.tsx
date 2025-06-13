'use client';

import React from 'react';

interface SectionListProps<T> {
  title: string;
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyState: React.ReactNode;
  defaultOpen?: boolean;
  footer?: React.ReactNode;
}

export default function SectionList<T>({
  title,
  data,
  renderItem,
  emptyState,
  defaultOpen = false,
  footer,
}: SectionListProps<T>) {
  const isOpen = defaultOpen && data.length > 0;
  return (
    <details className="border border-gray-200 rounded-md bg-white shadow-sm" open={isOpen}>
      <summary className="px-3 py-2 text-sm font-medium text-gray-700 cursor-pointer select-none">
        {title}
      </summary>
      <div className="px-3 pb-3">
        {data.length === 0 ? (
          <div className="text-sm text-gray-500 py-2">{emptyState}</div>
        ) : (
          <ul className="space-y-2 mt-2">
            {data.map((item, i) => (
              <li key={i}>{renderItem(item)}</li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </details>
  );
}
