// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

type ViewMode = 'today' | 'upcoming';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function ChevronRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-600">{hint}</p>
    </div>
  );
}

function Segmented({
  view,
  setView,
  todayCount,
  upcomingCount,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  todayCount: number;
  upcomingCount: number;
}) {
  return (
    <div
      className="inline-flex rounded-full bg-neutral-100 p-1 text-xs font-medium"
      role="tablist"
      aria-label="Schedule view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'today'}
        onClick={() => setView('today')}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 transition',
          view === 'today' ? 'bg-white text-neutral-900' : 'text-neutral-700 hover:text-neutral-900',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900/20 focus-visible:outline-offset-2',
        )}
      >
        Today
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            view === 'today' ? 'bg-neutral-100 text-neutral-800' : 'bg-neutral-200/60 text-neutral-700',
          )}
        >
          {todayCount}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={view === 'upcoming'}
        onClick={() => setView('upcoming')}
        className={cn(
          'inline-flex items-center gap-2 rounded-full px-4 py-2 transition',
          view === 'upcoming'
            ? 'bg-white text-neutral-900'
            : 'text-neutral-700 hover:text-neutral-900',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900/20 focus-visible:outline-offset-2',
        )}
      >
        Upcoming
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            view === 'upcoming'
              ? 'bg-neutral-100 text-neutral-800'
              : 'bg-neutral-200/60 text-neutral-700',
          )}
        >
          {upcomingCount}
        </span>
      </button>
    </div>
  );
}

function BookingRow({ booking, view }: { booking: Booking; view: ViewMode }) {
  const start = new Date(booking.start_time);

  const title = booking.service?.title || 'Booking';
  const clientName = booking.client
    ? `${booking.client.first_name} ${booking.client.last_name}`.trim()
    : 'Client';

  // Airbnb-ish: a clean left “time” column
  const left = view === 'today' ? format(start, 'h:mm a') : format(start, 'EEE · MMM d');

  const meta =
    view === 'today'
      ? `${clientName} · ${format(start, 'EEE, MMM d')}`
      : `${clientName} · ${format(start, 'h:mm a')}`;

  return (
    <li>
      <Link
        href={`/dashboard/events/${booking.id}`}
        className={cn(
          'group flex items-center justify-between gap-4 rounded-2xl px-3 py-3 transition',
          'hover:bg-neutral-50 hover:no-underline',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900/20 focus-visible:outline-offset-2',
        )}
      >
        <div className="flex min-w-0 items-start gap-4">
          <div className="w-20 shrink-0 pt-0.5 text-sm font-semibold text-neutral-900">
            {left}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{title}</p>
            <p className="mt-1 truncate text-xs text-neutral-600">{meta}</p>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-neutral-300 transition group-hover:text-neutral-400" />
      </Link>
    </li>
  );
}

export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<ViewMode>('today');

  // Keep a stable "now" for consistent memos while the page is open.
  const [now] = useState(() => new Date());
  const upcomingEnd = useMemo(() => addDays(now, 7), [now]);

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

  const { loading, error, bookings = [], bookingRequests = [] } = useArtistDashboardData(user?.id);
  const { count: unreadThreads } = useUnreadThreadsCount();

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
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [bookings, now, upcomingEnd],
  );

  const actionableRequests = useMemo(
    () =>
      bookingRequests.filter(
        (r: BookingRequest) => r.status === 'pending_quote' || r.status === 'quote_provided',
      ),
    [bookingRequests],
  );

  const activeList = useMemo(
    () => (view === 'today' ? todayBookings : upcomingSoon),
    [view, todayBookings, upcomingSoon],
  );

  const hasBookings = activeList.length > 0;

  const stats = useMemo(
    () => [
      {
        label: 'Bookings Today',
        value: todayBookings.length,
        hint: todayBookings.length ? 'Confirmed gigs scheduled for today' : 'No shows booked today',
      },
      { label: 'Next 7 Days', value: upcomingSoon.length, hint: 'Confirmed bookings in the next week' },
      {
        label: 'Quotes to Answer',
        value: actionableRequests.length,
        hint: 'Booking requests waiting for a quote',
      },
      {
        label: 'Unread Messages',
        value: unreadThreads,
        hint: unreadThreads ? 'Head to your inbox to reply' : 'You are all caught up',
      },
    ],
    [todayBookings.length, upcomingSoon.length, actionableRequests.length, unreadThreads],
  );

  if (!user || authLoading || loading) {
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
        <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-3xl items-center justify-center px-4 py-10 text-center">
          <div>
            <p className="text-sm font-semibold text-neutral-900">Couldn’t load your schedule</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Link
                href="/dashboard/artist"
                className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-900 hover:no-underline"
              >
                Open dashboard
              </Link>
              <Link
                href="/dashboard/bookings"
                className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-200 hover:no-underline"
              >
                View bookings
              </Link>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto min-h-[calc(100vh-120px)] max-w-3xl px-4 py-10">
        {/* Header (Airbnb-ish: big type, calm spacing) */}
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">Today</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
            {format(now, 'EEEE, d MMM yyyy')}
          </h1>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dashboard/artist"
              className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-neutral-900 hover:no-underline"
            >
              Artist dashboard
            </Link>
            <Link
              href="/dashboard/bookings"
              className="rounded-full bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-900 hover:bg-neutral-200 hover:no-underline"
            >
              All bookings
            </Link>
          </div>
        </div>

        {/* Stats: one clean panel, dividers instead of lots of cards */}
        <div className="mt-8 rounded-3xl bg-white px-5">
          <div className="grid grid-cols-2 gap-x-6 divide-y divide-neutral-100 sm:grid-cols-4 sm:divide-y-0 sm:divide-x sm:divide-neutral-100">
            {stats.map((s) => (
              <div key={s.label} className="sm:px-4">
                <StatBlock label={s.label} value={s.value} hint={s.hint} />
              </div>
            ))}
          </div>
        </div>

        {/* Segmented */}
        <div className="mt-8 flex justify-center">
          <Segmented
            view={view}
            setView={setView}
            todayCount={todayBookings.length}
            upcomingCount={upcomingSoon.length}
          />
        </div>

        {/* Content */}
        {!hasBookings ? (
          <div className="mt-8 space-y-6 text-center">
            <IllustratedEmpty
              variant="bookings"
              title="You don&apos;t have any bookings"
              description="Once a client confirms a booking, it will appear here for today or your upcoming schedule."
              className="mx-auto max-w-md"
            />
          </div>
        ) : (
          <div className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                {view === 'today' ? "Today's bookings" : 'Upcoming bookings'}
              </p>
              <Link
                href="/dashboard/bookings"
                className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
              >
                View all
              </Link>
            </div>

            {/* One panel + dividers (less visual noise) */}
            <div className="rounded-3xl bg-white">
              <ul className="divide-y divide-neutral-100 p-2">
                {activeList.map((booking: Booking) => (
                  <BookingRow key={booking.id} booking={booking} view={view} />
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
