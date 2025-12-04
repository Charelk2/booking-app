// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { format, isToday, isWithinInterval, addDays } from 'date-fns';

import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import { statusChipStyles } from '@/components/ui/status';
import { formatCurrency, formatStatus } from '@/lib/utils';
import { useArtistDashboardData } from '@/hooks/useArtistDashboardData';
import type { Booking } from '@/types';

type View = 'today' | 'upcoming';

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>('today');

  // Redirect non-artists (same pattern as Artist dashboard)
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

  const { loading, error, bookings } = useArtistDashboardData(user?.id);

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

  const activeList = view === 'today' ? todayBookings : upcomingSoon;

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
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-4 py-10">
        {/* Today / Upcoming pill toggle */}
        <div className="mb-10 inline-flex items-center rounded-full bg-gray-100 p-1 shadow-sm">
          <ToggleButton label="Today" active={view === 'today'} onClick={() => setView('today')} />
          <ToggleButton
            label="Upcoming"
            active={view === 'upcoming'}
            onClick={() => setView('upcoming')}
          />
        </div>

        {/* Content */}
        {activeList.length === 0 ? (
          <EmptyState view={view} />
        ) : (
          <BookingsList view={view} bookings={activeList} />
        )}
      </div>
    </MainLayout>
  );
}

/**
 * Simple rounded pills like Airbnb's Today / Upcoming switch
 */
function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative mx-1 rounded-full px-5 py-2 text-sm font-medium transition',
        active
          ? 'bg-gray-900 text-white shadow'
          : 'bg-transparent text-gray-700 hover:bg-white hover:text-gray-900',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

/**
 * Airbnb-style empty state: centered illustration placeholder, title, description + CTA
 */
function EmptyState({ view }: { view: View }) {
  const title =
    view === 'today'
      ? "You don't have any bookings today"
      : "You don't have any upcoming bookings";

  const description =
    view === 'today'
      ? "When you confirm a booking for today, it will show up here."
      : 'Confirmed future bookings will appear here.';

  return (
    <div className="flex max-w-md flex-col items-center text-center">
      {/* Illustration placeholder – swap this out for a real image if you want */}
      <div className="mb-8 h-40 w-40 rounded-full bg-gray-100 shadow-inner" />

      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{description}</p>

      <Link
        href="/dashboard/artist?tab=services"
        className="mt-6 inline-flex items-center justify-center rounded-full bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        Complete your listing
      </Link>
    </div>
  );
}

/**
 * Simple, centered list of bookings when there ARE reservations
 */
function BookingsList({ view, bookings }: { view: View; bookings: Booking[] }) {
  const heading =
    view === 'today' ? "Today's bookings" : 'Upcoming bookings';

  const subheading =
    view === 'today'
      ? 'These shows are scheduled for today.'
      : 'These bookings are coming up soon.';

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-center text-2xl font-semibold text-gray-900">{heading}</h1>
      <p className="mt-2 text-center text-sm text-gray-500">{subheading}</p>

      <ul className="mt-8 space-y-3">
        {bookings.map((booking) => (
          <li
            key={booking.id}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {booking.client?.first_name || 'Unknown'}{' '}
                  {booking.client?.last_name || ''}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-600">
                  {booking.service?.title || 'Booking'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {format(new Date(booking.start_time), 'EEE, d MMM · h:mm a')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={statusChipStyles(booking.status)}
                >
                  {formatStatus(booking.status)}
                </span>
                {booking.total_price != null && (
                  <p className="mt-2 text-xs font-semibold text-gray-900">
                    {formatCurrency(Number(booking.total_price))}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2 text-xs">
              <Link
                href={`/dashboard/events/${booking.id}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
              >
                View details
              </Link>
              <Link
                href="/dashboard/bookings"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-700 hover:bg-gray-50 hover:no-underline"
              >
                All bookings
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
