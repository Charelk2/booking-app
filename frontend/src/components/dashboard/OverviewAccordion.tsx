'use client';

import React from 'react';
import './dashboard.css';

interface Stat {
  label: string;
  value: string | number;
}

interface OverviewAccordionProps {
  primaryStats: Stat[];
  secondaryStats?: Stat[];
}

export default function OverviewAccordion({
  primaryStats,
  secondaryStats = [],
}: OverviewAccordionProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {primaryStats.map((s) => (
          <div key={s.label} className="overview-card">
            <span className="overview-label">{s.label}</span>
            <span className="overview-value">{s.value}</span>
          </div>
        ))}
      </div>
      {secondaryStats.length > 0 && (
        <details className="border border-gray-200 rounded-md bg-white shadow-sm">
          <summary className="px-3 py-2 text-sm font-medium text-gray-600 cursor-pointer select-none">
            Overview
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2 px-3 pb-3">
            {secondaryStats.map((s) => (
              <div key={s.label} className="overview-card">
                <span className="overview-label">{s.label}</span>
                <span className="overview-value">{s.value}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
