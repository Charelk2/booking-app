'use client';

import React from 'react';
import './dashboard.css';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface DashboardTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export default function DashboardTabs({ tabs, active, onChange }: DashboardTabsProps) {
  return (
    <div className="sticky top-0 z-30 bg-white border-b">
      <div className="flex text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 px-3 py-2 flex items-center justify-center space-x-1 ${
              active === tab.id
                ? 'text-brand-dark border-b-2 border-brand-dark'
                : 'text-gray-500'
            }`}
          >
            {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gray-200 px-2 text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
