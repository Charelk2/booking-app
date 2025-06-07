'use client';

import React from 'react';

interface RecentActivityProps {
  events: Array<{
    id: string | number;
    timestamp: string;
    description: string;
  }>;
}

export default function RecentActivity({ events }: RecentActivityProps) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
      {events.length === 0 ? (
        <div className="mt-4 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          You have no recent activity yet.
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {events.map((e) => (
            <li key={e.id} className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <span className="h-2 w-2 mt-2 block rounded-full bg-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-700">{e.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(e.timestamp).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
