'use client';
import React from 'react';

interface RecentActivityProps {
  events: unknown[];
}

export default function RecentActivity({ events }: RecentActivityProps) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
      {events.length === 0 ? (
        <div className="bg-gray-50 text-sm text-gray-500 px-4 py-4 rounded-lg mt-6">
          You have no recent activity yet.
        </div>
      ) : (
        <div className="mt-6">
          {/* TODO: render activity feed once events are available */}
        </div>
      )}
    </div>
  );
}
