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
  Clock, 
  MapPin, 
  ArrowUpRight,
  Calendar as CalendarIcon
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import IllustratedEmpty from '@/components/ui/IllustratedEmpty';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import type { Booking } from '@/types';

// --- Components ---

const TimeDisplay = ({ date, subtext }: { date: Date, subtext?: string }) => (
  <div className="flex w-20 flex-shrink-0 flex-col items-end pr-4 text-right">
    <span className="text-sm font-bold text-gray-900">{format(date, 'h:mm a')}</span>
    {subtext ? (
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{subtext}</span>
    ) : (
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Start</span>
    )}
  </div>
);

const BookingCard = ({ booking, isPast }: { booking: Booking, isPast: boolean }) => (
  <Link 
    href={`/dashboard/events/${booking.id}`}
    className={`group relative flex w-full items-center overflow-hidden rounded-3xl border border-white/40 bg-white/60 p-1.5 transition-all duration-300 hover:scale-[1.01] hover:bg-white/80 hover:shadow-xl hover:shadow-gray-200/50 ${isPast ? 'opacity-60 grayscale' : 'shadow-lg shadow-gray-200/40 backdrop-blur-xl'}`}
  >
    {/* Avatar / Icon */}
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-[1.2rem] bg-gradient-to-br from-gray-100 to-white text-lg font-bold text-gray-900 shadow-sm ring-1 ring-black/5">
      {booking.client?.first_name?.[0] || 'C'}
    </div>

    {/* Info */}
    <div className="flex-1 px-4 py-1">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {booking.service?.title || 'Private Session'}
        </h3>
      </div>
      <p className="text-sm text-gray-500">
        {booking.client ? `${booking.client.first_name} ${booking.client.last_name}` : 'Client'}
      </p>
      
      {/* Footer Info */}
      <div className="mt-1.5 flex items-center gap-3">
        {booking.location && (
           <div className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
             <MapPin size={10} />
             <span className="max-w-[120px] truncate">Location details</span>
           </div>
        )}
      </div>
    </div>

    {/* Action Arrow */}
    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-300 opacity-0 shadow-sm transition-all duration-300 group-hover:opacity-100 group-hover:text-black">
      <ArrowUpRight size={16} />
    </div>
  </Link>
);

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'today' | 'upcoming'>('today');

  // Auth Protection
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push(`/auth?intent=login&next=${encodeURIComponent(pathname)}`);
    else if (user.user_type !== 'service_provider') router.push('/dashboard/client');
  }, [user, authLoading, router, pathname]);

  const { loading, error, bookings } = useArtistDashboardData(user?.id);

  // --- Logic ---
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

  // --- Loading / Error States ---
  if (!user || authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex h-[calc(100vh-100px)] items-center justify-center"><Spinner size="lg" /></div>
      </MainLayout>
    );
  }

  if (error) return <MainLayout><div className="p-10 text-center text-red-500">{error}</div></MainLayout>;

  return (
    <MainLayout>
      {/* Subtle Dynamic Background */}
      <div className="fixed inset-0 -z-10 bg-[#FAFAFA]">
        <div className="absolute -top-[20%] -right-[10%] h-[600px] w-[600px] rounded-full bg-blue-50/50 blur-[120px]" />
        <div className="absolute top-[20%] -left-[10%] h-[500px] w-[500px] rounded-full bg-purple-50/50 blur-[120px]" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-12">
        
        {/* Top Navigation / Heading */}
        <div className="mb-12 flex flex-col items-center gap-6 sm:flex-row sm:justify-between sm:items-end">
          <div className="text-center sm:text-left">
            <h1 className="text-3xl font-light tracking-tight text-gray-900 sm:text-4xl">
              {greeting}, <span className="font-semibold">{user.first_name}</span>
            </h1>
            <p className="mt-2 text-sm font-medium uppercase tracking-widest text-gray-400">
              {format(now, 'EEEE, d MMMM')}
            </p>
          </div>

          {/* Combined Tabs & Stats (The "Pill") */}
          <div className="flex overflow-hidden rounded-full bg-gray-200/50 p-1.5 backdrop-blur-md">
            <button
              onClick={() => setView('today')}
              className={`relative flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
                view === 'today' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Today
              <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                view === 'today' ? 'bg-black text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {todayBookings.length}
              </span>
            </button>
            <button
              onClick={() => setView('upcoming')}
              className={`relative flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-300 ${
                view === 'upcoming' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Upcoming
              <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] ${
                view === 'upcoming' ? 'bg-black text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                {upcomingSoon.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-10">
              <IllustratedEmpty
                variant="bookings"
                title={view === 'today' ? "Enjoy your day off" : "No upcoming gigs"}
                description={view === 'today' 
                  ? "Your schedule is clear today. Rest up or manage your profile."
                  : "You have no confirmed bookings for the next 7 days."
                }
                className="max-w-xs opacity-80"
              />
              <Link href="/dashboard/artist" className="mt-8 text-xs font-semibold uppercase tracking-widest text-gray-400 hover:text-black transition-colors">
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {activeList.map((booking: Booking) => {
                const startTime = new Date(booking.start_time);
                const isPast = new Date() > startTime && view === 'today';
                const dayLabel = view === 'upcoming' ? format(startTime, 'EEE') : undefined;

                return (
                  <div key={booking.id} className="flex items-center gap-2">
                    {/* Time Column */}
                    <TimeDisplay date={startTime} subtext={dayLabel} />
                    
                    {/* Card Column */}
                    <div className="flex-1">
                      <BookingCard booking={booking} isPast={isPast} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer Hint */}
        {activeList.length > 0 && (
           <div className="mt-12 text-center">
             <Link href="/dashboard/bookings" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300 transition-colors hover:text-gray-500">
               <CalendarIcon size={12} />
               View Full Calendar
             </Link>
           </div>
        )}
      </div>
    </MainLayout>
  );
}