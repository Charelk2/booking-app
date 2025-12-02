// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { format, isToday, isWithinInterval, addDays } from 'date-fns';

import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import StatGrid from '@/components/ui/StatGrid';
import Section from '@/components/ui/Section';
import IllustratedEmpty from '@/components/ui/IllustratedEmpty';
import { statusChipStyles } from '@/components/ui/status';
import { formatCurrency, formatStatus } from '@/lib/utils';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import useUnreadThreadsCount from '@/hooks/useUnreadThreadsCount';
import type { Booking, BookingRequest } from '@/types';

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <hgroup>
            <h1 className="text-2xl font-semibold text-gray-900">Today</h1>
            <p className="text-sm text-gray-500">
              {format(now, "EEEE, d MMM yyyy")} · Snapshot of your shows, tasks, and messages.
            </p>
          </hgroup>
        </header>

        {/* Stat cards */}
        <StatGrid items={stats} columns={4} />
        {/* :contentReference[oaicite:14]{index=14} */}

        {/* Main content grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          {/* Left: bookings lists */}
          <div className="space-y-6">
            <Section
              title="Today&apos;s bookings"
              subtitle="Your confirmed gigs scheduled for today"
            >
              <div className="space-y-3">
                {todayBookings.length === 0 && (
                  <IllustratedEmpty
                    variant="bookings"
                    title="No bookings today"
                    description="When you confirm a booking for today, it will appear here with client, time and status."
                  />
                )}

                {todayBookings.map((booking: Booking) => (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {booking.client?.first_name || 'Unknown'}{' '}
                          {booking.client?.last_name || ''}
                        </div>
                        <div className="mt-0.5 text-sm text-gray-600 truncate">
                          {booking.service?.title || '—'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {format(
                            new Date(booking.start_time),
                            'MMM d, yyyy h:mm a',
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={statusChipStyles(booking.status)}
                        >
                          {formatStatus(booking.status)}
                        </span>
                        <div className="mt-2 text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(booking.total_price))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={`/dashboard/events/${booking.id}`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
                      >
                        View event
                      </Link>
                      <Link
                        href={`/dashboard/bookings`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
                      >
                        All bookings
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="Next 7 days"
              subtitle="Your next confirmed gigs at a glance"
            >
              <div className="space-y-3">
                {upcomingSoon.length === 0 && (
                  <IllustratedEmpty
                    variant="bookings"
                    title="No upcoming bookings in the next 7 days"
                    description="When you confirm a booking, it will show up here with date, status, and payout."
                  />
                )}

                {upcomingSoon.map((booking: Booking) => (
                  <div
                    key={booking.id}
                    className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {booking.client?.first_name || 'Unknown'}{' '}
                          {booking.client?.last_name || ''}
                        </div>
                        <div className="mt-0.5 text-sm text-gray-600 truncate">
                          {booking.service?.title || '—'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {format(
                            new Date(booking.start_time),
                            'MMM d, yyyy h:mm a',
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={statusChipStyles(booking.status)}
                        >
                          {formatStatus(booking.status)}
                        </span>
                        <div className="mt-2 text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(booking.total_price))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Link
                        href={`/dashboard/events/${booking.id}`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
                      >
                        View event
                      </Link>
                      <Link
                        href={`/dashboard/bookings`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
                      >
                        All bookings
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Optional: keep using your existing BookingsSection for a richer upcoming view */}
            {/* <BookingsSection bookings={bookings} loading={loading} error={error || undefined} /> */}
          </div>

          {/* Right: tasks + messages + shortcuts */}
          <div className="space-y-6">
            <Section
              title="Tasks for you"
              subtitle="Requests that need a response"
            >
              {actionableRequests.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No quotes waiting right now. You’re up to date 🎉
                </p>
              ) : (
                <ul className="space-y-3">
                  {actionableRequests.slice(0, 5).map((req) => (
                    <li
                      key={req.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {req.client
                            ? `${req.client.first_name} ${req.client.last_name}`
                            : 'Client'}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {req.status === 'pending_quote'
                            ? 'Quote needed'
                            : 'Quote sent – waiting on client'}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/artist?tab=requests`}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Messages" subtitle="Stay on top of your inbox">
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {unreadThreads > 0
                      ? `${unreadThreads} unread thread${
                          unreadThreads > 1 ? 's' : ''
                        }`
                      : 'No unread messages'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    New chat replies and booking updates land here.
                  </p>
                </div>
                <Link
                  href="/inbox"
                  className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 hover:no-underline"
                >
                  Go to inbox
                </Link>
              </div>
            </Section>

            <Section title="Shortcuts">
              <div className="grid grid-cols-1 gap-3">
                <Link
                  href="/dashboard/bookings"
                  className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:no-underline"
                >
                  View all bookings
                </Link>
                <Link
                  href="/dashboard/artist?tab=requests"
                  className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:no-underline"
                >
                  View booking requests
                </Link>
                <Link
                  href="/dashboard/artist?tab=services"
                  className="rounded-lg bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:no-underline"
                >
                  Manage services
                </Link>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
