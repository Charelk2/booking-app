// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { format, isToday, isWithinInterval, addDays } from 'date-fns';

import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import IllustratedEmpty from '@/components/ui/IllustratedEmpty';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import type { Booking, BookingRequest } from '@/types';

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<'today' | 'upcoming'>('today');

  // Redirect non-artists, copy the pattern from ArtistDashboardPage
  // frontend/src/app/dashboard/artist/page.tsx
  React.useEffect(() => {
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
    bookingRequests,
    dashboardStats,
  } = useArtistDashboardData(user?.id); // same hook as artist dashboard

  const { count: unreadThreads } = useUnreadThreadsCount();

  const now = new Date();
  const upcomingEnd = addDays(now, 7);

  const todayBookings = useMemo(
    () =>
      bookings.filter((b: Booking) =>
        isToday(new Date(b.start_time)),
      ),
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

  const actionableRequests = useMemo(
    () =>
      bookingRequests.filter(
        (r: BookingRequest) =>
          r.status === 'pending_quote' || r.status === 'quote_provided',
      ),
    [bookingRequests],
  );

  const stats = useMemo(
    () => [
      {
        label: 'Bookings Today',
        value: todayBookings.length,
        hint:
          todayBookings.length > 0
            ? 'Confirmed gigs scheduled for today'
            : 'No shows booked today',
      },
      {
        label: 'Next 7 Days',
        value: upcomingSoon.length,
        hint: 'Confirmed bookings in the next week',
      },
      {
        label: 'Quotes to Answer',
        value: actionableRequests.length,
        hint: 'Booking requests waiting for a quote',
      },
      {
        label: 'Unread Messages',
        value: unreadThreads,
        hint: unreadThreads > 0 ? 'Head to your inbox to reply' : 'You are all caught up',
      },
    ],
    [todayBookings.length, upcomingSoon.length, actionableRequests.length, unreadThreads],
  );

  const activeList = useMemo(
    () => (view === 'today' ? todayBookings : upcomingSoon),
    [view, todayBookings, upcomingSoon],
  );
  const hasBookings = activeList.length > 0;

  if (!user || authLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center">
          <Spinner size="lg" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-3xl flex-col items-center justify-center px-4 py-8 text-center">
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Today</p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {format(now, 'EEEE, d MMM yyyy')}
            </h1>
          </div>

          {/* Today / Upcoming segmented control */}
          <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setView('today')}
              className={`px-4 py-2 rounded-full ${
                view === 'today'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setView('upcoming')}
              className={`px-4 py-2 rounded-full ${
                view === 'upcoming'
                  ? 'bg-black text-white shadow-sm'
                  : 'text-gray-700 hover:text-gray-900'
              }`}
            >
              Upcoming
            </button>
          </div>

          {/* Main content */}
          {!hasBookings ? (
            <div className="mt-4 space-y-6">
              <IllustratedEmpty
                variant="bookings"
                title="You don&apos;t have any bookings"
                description="Once a client confirms a booking, it will appear here for today or your upcoming schedule."
                className="max-w-md mx-auto"
              />
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-500">
                  Want to manage more details? Use your full dashboard.
                </p>
                <Link
                  href="/dashboard/artist"
                  className="inline-flex items-center rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-900 hover:no-underline"
                >
                  Open artist dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 w-full max-w-xl text-left">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
                {view === 'today' ? "Today's bookings" : 'Upcoming bookings'}
              </p>
              <ul className="space-y-3">
                {activeList.map((booking: Booking) => (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {booking.service?.title || 'Booking'}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500 truncate">
                        {booking.client
                          ? `${booking.client.first_name} ${booking.client.last_name}`
                          : 'Client'}{' '}
                        ·{' '}
                        {format(
                          new Date(booking.start_time),
                          'EEE, MMM d · h:mm a',
                        )}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/events/${booking.id}`}
                      className="ml-4 whitespace-nowrap text-xs font-medium text-gray-700 hover:text-gray-900 hover:underline"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-right">
                <Link
                  href="/dashboard/bookings"
                  className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                >
                  View all bookings
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
