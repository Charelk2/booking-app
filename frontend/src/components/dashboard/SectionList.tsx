'use client';

import React, { useState } from 'react';
import CollapsibleSection from '../ui/CollapsibleSection';

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
  const [open, setOpen] = useState(defaultOpen && data.length > 0);

  return (
    <CollapsibleSection
      title={title}
      open={open}
      onToggle={() => setOpen(!open)}
      className="border border-gray-200 rounded-md shadow-sm"
    >
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
    </CollapsibleSection>
  );
}
