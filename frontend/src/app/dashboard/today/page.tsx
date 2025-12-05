// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { 
  format, 
  isToday, 
  isWithinInterval, 
  addDays 
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

interface ToggleButtonProps {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}

const ToggleButton = ({ active, label, count = 0, onClick }: ToggleButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
      active
        ? 'bg-black text-white shadow-sm'
        : 'text-gray-700 hover:text-black hover:bg-gray-100'
    }`}
  >
    <span>{label}</span>
    {count > 0 && (
      <span
        className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
          active ? 'bg-white/15 text-white' : 'bg-gray-200 text-gray-700'
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const AirbnbCard = ({ booking }: { booking: Booking }) => {
  const startTime = new Date(booking.start_time);
  
  return (
    <Link 
      href={`/dashboard/events/${booking.id}`}
      className="group flex flex-col sm:flex-row gap-4 w-full rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-lg hover:border-gray-300 hover:no-underline active:scale-[0.99]"
    >
      {/* Date Block (Time Removed) */}
      <div className="flex flex-row sm:flex-col items-center sm:items-center justify-between sm:justify-center rounded-lg bg-gray-50 px-4 py-3 sm:w-20 border border-gray-100 shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
          {format(startTime, 'MMM')}
        </span>
        <span className="text-xl font-bold text-gray-900">
          {format(startTime, 'd')}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-between min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">
            {booking.service?.title || 'Service Booking'}
          </h3>
          <p className="text-sm font-medium text-gray-600 truncate">
            {booking.client ? `${booking.client.first_name} ${booking.client.last_name}` : 'Client Name'}
          </p>
          
          {/* Meta Info (Time is here) */}
          <div className="mt-2 flex items-center gap-4 text-xs font-medium text-gray-500">
             <div className="flex items-center gap-1 shrink-0">
               <Clock size={12} className="text-gray-400" />
               <span>{format(startTime, 'h:mm a')}</span>
             </div>
             {(booking as any).location && (
               <div className="flex items-center gap-1 min-w-0">
                 <MapPin size={12} className="text-gray-400 shrink-0" />
                 <span className="truncate max-w-[150px]">{(booking as any).location || 'Location'}</span>
               </div>
             )}
          </div>
        </div>

        {/* Chevron */}
        <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors group-hover:bg-gray-100 group-hover:text-black">
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

  const todayBookings = useMemo(
    () => bookings.filter((b: Booking) => isToday(new Date(b.start_time))),
    [bookings],
  );

  const upcomingSoon = useMemo(
    () =>
      bookings
        .filter((b: Booking) =>
          isWithinInterval(new Date(b.start_time), { start: now, end: upcomingEnd }),
        )
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        ),
    [bookings, now, upcomingEnd],
  );

  const activeList = useMemo(
    () => (view === 'today' ? todayBookings : upcomingSoon),
    [view, todayBookings, upcomingSoon],
  );

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
        <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-10 text-center">
          {/* Page label + date */}
          <header className="mb-10 space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
              Today
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {format(now, 'EEEE, d MMM yyyy')}
            </h1>
          </header>

          {/* Today / Upcoming toggle – pill style */}
          <div className="mb-12 inline-flex rounded-full bg-gray-100 p-1 shadow-inner">
            <ToggleButton
              active={view === 'today'}
              label="Today"
              count={todayBookings.length}
              onClick={() => setView('today')}
            />
            <ToggleButton
              active={view === 'upcoming'}
              label="Upcoming"
              count={upcomingSoon.length}
              onClick={() => setView('upcoming')}
            />
          </div>

          {/* Empty state vs schedule list */}
          {activeList.length === 0 ? (
            <div className="flex flex-col items-center">
              <IllustratedEmpty
                variant="bookings"
                title={
                  view === 'today'
                    ? "You don't have any events today"
                    : "You don't have upcoming events"
                }
                description={
                  view === 'today'
                    ? "To start getting bookings on this page, complete and publish your listing."
                    : "Once clients book you, their events for this period will appear here."
                }
                action={
                  <Link
                    href="/dashboard/profile/edit?incomplete=1"
                    className="inline-flex items-center justify-center rounded-full bg-black px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 hover:no-underline"
                  >
                    Complete your listing
                  </Link>
                }
                className="w-full max-w-sm"
              />

              <Link
                href="/dashboard/artist"
                className="mt-6 text-sm font-semibold text-gray-700 hover:text-black hover:no-underline"
              >
                Back to dashboard
              </Link>
            </div>
          ) : (
            <div className="mt-4 w-full space-y-4 text-left">
              {activeList.map((booking: Booking) => (
                <AirbnbCard key={booking.id} booking={booking} />
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
