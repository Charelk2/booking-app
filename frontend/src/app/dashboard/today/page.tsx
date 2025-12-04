// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { 
  format, 
  isToday, 
  isWithinInterval, 
  addDays, 
  getHours 
} from 'date-fns';
import { 
  MapPin, 
  ChevronRight,
  Clock
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import IllustratedEmpty from '@/components/ui/IllustratedEmpty';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import type { Booking } from '@/types';

// --- Components ---

const TabButton = ({ active, label, count, onClick }: any) => (
  <button
    onClick={onClick}
    className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 ${
      active
        ? 'border-black text-black'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
    }`}
  >
    <span className="flex items-center justify-center gap-2">
      {label}
      {count > 0 && (
        <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
          active ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {count}
        </span>
      )}
    </span>
  </button>
);

const AirbnbCard = ({ booking }: { booking: Booking }) => {
  const startTime = new Date(booking.start_time);
  
  return (
    <Link 
      href={`/dashboard/events/${booking.id}`}
      className="group flex flex-col sm:flex-row gap-4 w-full rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-lg hover:border-gray-300 active:scale-[0.99]"
    >
      {/* Date/Time Block */}
      <div className="flex flex-row sm:flex-col items-center sm:items-start justify-between sm:justify-center rounded-lg bg-gray-50 px-4 py-3 sm:w-24 border border-gray-100">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {format(startTime, 'MMM')}
        </span>
        <div className="flex items-baseline gap-1 sm:block">
          <span className="text-xl font-bold text-gray-900">
            {format(startTime, 'd')}
          </span>
          <span className="text-xs font-medium text-gray-500 sm:hidden">
             , {format(startTime, 'h:mm a')}
          </span>
        </div>
        <span className="hidden sm:block text-xs font-semibold text-gray-900 mt-1">
          {format(startTime, 'HH:mm')}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold text-gray-900 line-clamp-1">
            {booking.service?.title || 'Service Booking'}
          </h3>
          <p className="text-sm font-medium text-gray-600">
            {booking.client ? `${booking.client.first_name} ${booking.client.last_name}` : 'Client Name'}
          </p>
          
          {/* Meta Info */}
          <div className="mt-2 flex items-center gap-4 text-xs font-medium text-gray-500">
             <div className="flex items-center gap-1">
               <Clock size={12} className="text-gray-400" />
               <span>{format(startTime, 'h:mm a')}</span>
             </div>
             {booking.location && (
               <div className="flex items-center gap-1">
                 <MapPin size={12} className="text-gray-400" />
                 <span className="truncate max-w-[150px]">Location</span>
               </div>
             )}
          </div>
        </div>

        {/* Chevron */}
        <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition-colors group-hover:bg-gray-100 group-hover:text-black">
          <ChevronRight size={20} strokeWidth={2.5} />
        </div>
      </div>
    </Link>
  );
};

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'today' | 'upcoming'>('today');

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push(`/auth?intent=login&next=${encodeURIComponent(pathname)}`);
    else if (user.user_type !== 'service_provider') router.push('/dashboard/client');
  }, [user, authLoading, router, pathname]);

  const { loading, error, bookings } = useArtistDashboardData(user?.id);

  const now = new Date();
  const upcomingEnd = addDays(now, 7);

  const todayBookings = useMemo(() => 
    bookings.filter((b: Booking) => isToday(new Date(b.start_time))), 
  [bookings]);

  const upcomingSoon = useMemo(() => 
    bookings
      .filter((b: Booking) => isWithinInterval(new Date(b.start_time), { start: now, end: upcomingEnd }))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
  [bookings, now, upcomingEnd]);

  const activeList = useMemo(() => 
    (view === 'today' ? todayBookings : upcomingSoon), 
  [view, todayBookings, upcomingSoon]);

  const greeting = useMemo(() => {
    const h = getHours(now);
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, [now]);

  if (!user || authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-white"><Spinner size="lg" /></div>
      </MainLayout>
    );
  }

  if (error) return <MainLayout><div className="p-10 text-center text-red-600 font-medium">{error}</div></MainLayout>;

  return (
    <MainLayout>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-3xl px-6 py-10">
          
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              {greeting}, {user.first_name}.
            </h1>
            <p className="mt-1 text-base font-medium text-gray-500">
              {format(now, 'EEEE, d MMMM yyyy')}
            </p>
          </header>

          {/* Tabs */}
          <div className="mb-8 flex border-b border-gray-200">
            <TabButton 
              active={view === 'today'} 
              label="Today" 
              count={todayBookings.length}
              onClick={() => setView('today')} 
            />
            <TabButton 
              active={view === 'upcoming'} 
              label="Upcoming" 
              count={upcomingSoon.length}
              onClick={() => setView('upcoming')} 
            />
          </div>

          {/* Content */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {view === 'today' ? "Today's Schedule" : "Next 7 Days"}
              </h2>
            </div>

            {activeList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
                <IllustratedEmpty
                  variant="bookings"
                  title="No bookings found"
                  description={view === 'today' 
                    ? "Your schedule is clear for today."
                    : "You have no upcoming bookings for the next week."
                  }
                  className="mx-auto max-w-xs mb-4"
                />
                <Link 
                  href="/dashboard/artist" 
                  className="text-sm font-semibold text-black hover:text-gray-700"
                >
                  Go to Dashboard
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {activeList.map((booking: Booking) => (
                  <AirbnbCard key={booking.id} booking={booking} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}