"use client";
import React from "react";

export type StatItem = {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
};

type StatGridProps = {
  items: StatItem[];
  columns?: 2 | 3 | 4;
};

const StatGrid: React.FC<StatGridProps> = ({ items, columns = 4 }) => {
  const gridCols = columns === 4 ? "md:grid-cols-4" : columns === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={`grid grid-cols-2 ${gridCols} gap-3 md:gap-4`}>
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            {it.icon && <div className="text-xl text-gray-400">{it.icon}</div>}
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-gray-500">{it.label}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900">{it.value}</div>
              {it.hint && <div className="mt-0.5 text-xs text-gray-400">{it.hint}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatGrid;

