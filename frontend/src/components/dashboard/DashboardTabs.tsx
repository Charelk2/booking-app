'use client';

import React from 'react';
import './dashboard.css';

interface Tab {
  id: "bookings" | "services" | "requests"; // Make id specific to allowed tab types
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface DashboardTabsProps {
  tabs: Tab[];
  active: "bookings" | "services" | "requests"; // Make active specific to allowed tab types
  onChange: (id: "bookings" | "services" | "requests") => void; // Make onChange id specific
}

export default function DashboardTabs({ tabs, active, onChange }: DashboardTabsProps) {
  return (
    <div className="sticky top-0 z-30 bg-gray-50 border-b">
      <div className="flex text-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 px-4 py-2 flex items-center justify-center space-x-1 ${
              active === tab.id
                ? 'text-gray-900 border-b-2 border-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.icon && <span className="h-4 w-4">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 text-xs text-gray-600">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}