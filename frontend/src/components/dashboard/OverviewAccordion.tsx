'use client';

import React, { useState } from 'react';
import './dashboard.css';
import OverviewCard from './OverviewCard';
import CollapsibleSection from '../ui/CollapsibleSection';

interface Stat {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {primaryStats.map((s) => (
          <OverviewCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon ?? null}
          />
        ))}
      </div>
      {secondaryStats.length > 0 && (
        <CollapsibleSection
          title="Overview"
          open={open}
          onToggle={() => setOpen(!open)}
          className="border border-gray-200 rounded-md shadow-sm"
        >
          <div className="mt-2 grid grid-cols-2 gap-3">
            {secondaryStats.map((s) => (
              <OverviewCard
                key={s.label}
                label={s.label}
                value={s.value}
                icon={s.icon ?? null}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
