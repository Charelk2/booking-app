'use client';
import { useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';

export default function TodayPage() {
  const [view, setView] = useState<'today' | 'upcoming'>('today');
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4">
        <h1 className="text-xl font-semibold mb-4">Bookings</h1>
        <div className="flex space-x-4 mb-4">
          <button
            type="button"
            onClick={() => setView('today')}
            className={view === 'today' ? 'font-bold' : ''}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setView('upcoming')}
            className={view === 'upcoming' ? 'font-bold' : ''}
          >
            Upcoming
          </button>
        </div>
        <p>
          {view === 'today'
            ? "Today's shows will appear here."
            : 'Upcoming bookings will appear here.'}
        </p>
      </div>
    </MainLayout>
  );
}
