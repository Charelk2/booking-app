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
  Calendar, 
  Clock, 
  MapPin, 
  ChevronRight, 
  Briefcase
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import IllustratedEmpty from '@/components/ui/IllustratedEmpty';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import type { Booking } from '@/types';

// --- Utility Components for the "Glass" Look ---

const GlassCard = ({ children, className = "", onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={`group relative overflow-hidden rounded-3xl border border-white/20 bg-white/70 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white/90 ${className}`}
  >
    {children}
  </div>
);

const StatChip = ({ icon: Icon, label, value, active = false, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`flex w-full flex-col items-center justify-center rounded-2xl p-4 transition-all duration-300 ${
      active 
        ? 'bg-black text-white shadow-lg scale-[1.02]' 
        : 'bg-white/50 text-gray-600 hover:bg-white hover:scale-[1.02]'
    }`}
  >
    <div className="flex items-center gap-2 mb-1">
      <Icon size={16} className={active ? 'text-white/80' : 'text-gray-400'} />
      <span className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</span>
    </div>
    <span className="text-2xl font-semibold tracking-tight">{value}</span>
  </button>
);

// --- Main Page Component ---

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'today' | 'upcoming'>('today');

  // Auth Redirection
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(`/auth?intent=login&next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (user.user_type !== 'service_provider') {
      router.push('/dashboard/client');
    }
  }, [user, authLoading, router, pathname]);

  const {
    loading,
    error,
    bookings,
  } = useArtistDashboardData(user?.id);

  // --- Data Logic ---
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

  // Greeting Logic
  const greeting = useMemo(() => {
    const hour = getHours(now);
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, [now]);

  // --- Render States ---

  if (!user || authLoading || loading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-50/50">
          <div className="rounded-2xl bg-red-50 px-6 py-4 text-red-600 shadow-sm border border-red-100">
            <p className="text-sm font-medium">{error}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none -z-10 bg-gray-50/50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-blue-100/30 rounded-full blur-[100px] opacity-60 mix-blend-multiply" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-100/30 rounded-full blur-[100px] opacity-60 mix-blend-multiply" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] max-w-2xl flex-col px-6 py-10">
        
        {/* Header Section */}
        <header className="mb-10 text-center sm:text-left">
          <p className="text-sm font-medium uppercase tracking-widest text-gray-400 mb-2">
            {format(now, 'EEEE, d MMMM')}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            {greeting}, <span className="text-gray-500 font-normal">{user.first_name || 'Artist'}.</span>
          </h1>
        </header>

        {/* HUD / Stats Grid (Just 2 items now) */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <StatChip 
            icon={Calendar} 
            label="Today" 
            value={todayBookings.length} 
            active={view === 'today'}
            onClick={() => setView('today')}
          />
          <StatChip 
            icon={Briefcase} 
            label="Upcoming" 
            value={upcomingSoon.length} 
            active={view === 'upcoming'}
            onClick={() => setView('upcoming')}
          />
        </div>

        {/* Content Wrapper */}
        <div className="space-y-8">
          
          {/* Sub Header / Count */}
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {view === 'today' ? "Today's Schedule" : "Next 7 Days"}
            </h2>
            {activeList.length > 0 && (
              <span className="text-xs font-medium text-gray-400">
                {activeList.length} {activeList.length === 1 ? 'event' : 'events'}
              </span>
            )}
          </div>

          {/* Timeline / List View */}
          {activeList.length === 0 ? (
            <div className="py-8">
               <IllustratedEmpty
                variant="bookings"
                title={view === 'today' ? "Clear Schedule" : "No Upcoming Gigs"}
                description={view === 'today' 
                  ? "You have no bookings scheduled for today." 
                  : "Your schedule is clear for the next week."}
                className="max-w-md mx-auto"
              />
              <div className="flex justify-center mt-6">
                <Link
                  href="/dashboard/artist"
                  className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-gray-800"
                >
                  Go to Dashboard <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="relative border-l-2 border-gray-100 ml-3 sm:ml-6 space-y-8 py-2">
              {activeList.map((booking: Booking) => {
                const startTime = new Date(booking.start_time);
                const isPast = new Date() > startTime && view === 'today';

                return (
                  <div key={booking.id} className="relative pl-8 sm:pl-10 group">
                    {/* Timeline Dot */}
                    <div className={`absolute -left-[9px] top-6 h-4 w-4 rounded-full border-4 border-white ${
                      isPast ? 'bg-gray-300' : 'bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.1)]'
                    }`} />
                    
                    {/* Time Label */}
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-400">
                      <Clock size={12} />
                      {format(startTime, 'h:mm a')}
                      {view === 'upcoming' && (
                        <span className="text-gray-300 font-light">| {format(startTime, 'EEE, MMM d')}</span>
                      )}
                    </div>

                    {/* Card */}
                    <Link href={`/dashboard/events/${booking.id}`}>
                      <GlassCard className={`p-5 flex items-center justify-between ${isPast ? 'opacity-60 grayscale-[0.5]' : ''}`}>
                        <div className="flex items-center gap-4">
                          {/* Avatar Placeholder */}
                          <div className="h-12 w-12 flex-shrink-0 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-gray-500 text-sm font-bold shadow-inner">
                            {booking.client?.first_name?.[0] || 'C'}
                            {booking.client?.last_name?.[0]}
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold text-gray-900">
                              {booking.service?.title || 'Private Booking'}
                            </h3>
                            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                              <span className="font-medium text-gray-700">
                                {booking.client 
                                  ? `${booking.client.first_name} ${booking.client.last_name}` 
                                  : 'Client'}
                              </span>
                              {booking.location && (
                                <>
                                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                                  <span className="flex items-center gap-1 truncate max-w-[150px]">
                                    <MapPin size={10} />
                                    Location details
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 transition-colors group-hover:border-black group-hover:bg-black group-hover:text-white">
                          <ChevronRight size={16} />
                        </div>
                      </GlassCard>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}