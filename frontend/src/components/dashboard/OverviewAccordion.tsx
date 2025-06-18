'use client';

import React, { useState } from 'react';
import './dashboard.css';
import CollapsibleSection from '../ui/CollapsibleSection';

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
  const [open, setOpen] = useState(false);

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
        <CollapsibleSection
          title="Overview"
          open={open}
          onToggle={() => setOpen(!open)}
          className="border border-gray-200 rounded-md shadow-sm"
        >
          <div className="mt-2 grid grid-cols-2 gap-2">
            {secondaryStats.map((s) => (
              <div key={s.label} className="overview-card">
                <span className="overview-label">{s.label}</span>
                <span className="overview-value">{s.value}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
