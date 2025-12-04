// frontend/src/app/dashboard/today/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { addDays, format, isToday, isWithinInterval } from 'date-fns';

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

/* --------- Tiny inline icons (no new deps) --------- */
function IconArrowRight(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
    </svg>
  );
}
function IconCalendar(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18" />
    </svg>
  );
}
function IconSparkles(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12l.7 2.4L22 15l-2.3.6L19 18l-.7-2.4L16 15l2.3-.6L19 12z" />
    </svg>
  );
}
function IconBolt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h8l-1 8 11-14h-8l0-6z" />
    </svg>
  );
}
function IconChat(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a4 4 0 01-4 4H9l-6 3V7a4 4 0 014-4h10a4 4 0 014 4v8z" />
    </svg>
  );
}

/* --------- UI blocks --------- */
function BackgroundBlobs() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
      <div className="absolute left-1/2 top-[-140px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-200 via-fuchsia-200 to-sky-200 blur-3xl opacity-60" />
      <div className="absolute left-[8%] top-[80px] h-[280px] w-[280px] rounded-full bg-gradient-to-tr from-emerald-200 via-white to-amber-200 blur-3xl opacity-40" />
      <div className="absolute right-[6%] top-[140px] h-[260px] w-[260px] rounded-full bg-gradient-to-tr from-rose-200 via-white to-violet-200 blur-3xl opacity-35" />
    </div>
  );
}

function TodaySkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="animate-pulse space-y-4">
        <div className="rounded-3xl border border-black/5 bg-white/70 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="h-3 w-20 rounded bg-black/10" />
          <div className="mt-3 h-10 w-64 rounded bg-black/10" />
          <div className="mt-2 h-4 w-40 rounded bg-black/10" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-black/5 bg-white/70 ring-1 ring-black/5 backdrop-blur"
              />
            ))}
          </div>
        </div>

        <div className="h-12 rounded-full border border-black/5 bg-white/70 ring-1 ring-black/5 backdrop-blur" />

        <div className="rounded-3xl border border-black/5 bg-white/70 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
          <div className="h-6 w-40 rounded bg-black/10" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl border border-black/5 bg-white ring-1 ring-black/5" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 ring-1 ring-black/5">
          {Icon({ className: 'h-5 w-5 text-gray-700' })}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-600">{hint}</p>

      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-tr from-indigo-100 via-fuchsia-100 to-sky-100 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-90" />
    </div>
  );
}

function Segmented({
  view,
  onChange,
  todayCount,
  upcomingCount,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  todayCount: number;
  upcomingCount: number;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-black/5 bg-white/70 p-1 shadow-sm ring-1 ring-black/5 backdrop-blur"
      role="tablist"
      aria-label="Schedule view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'today'}
        onClick={() => onChange('today')}
        className={cn(
          'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
          view === 'today' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-black/5',
        )}
      >
        Today
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold',
            view === 'today' ? 'bg-white/15 text-white' : 'bg-black/5 text-gray-700',
          )}
        >
          {todayCount}
        </span>
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={view === 'upcoming'}
        onClick={() => onChange('upcoming')}
        className={cn(
          'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
          view === 'upcoming' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-700 hover:bg-black/5',
        )}
      >
        Next 7 days
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold',
            view === 'upcoming' ? 'bg-white/15 text-white' : 'bg-black/5 text-gray-700',
          )}
        >
          {upcomingCount}
        </span>
      </button>
    </div>
  );
}

function BookingCard({ booking, view }: { booking: Booking; view: ViewMode }) {
  const start = new Date(booking.start_time);
  const title = booking.service?.title || 'Booking';
  const clientName = booking.client
    ? `${booking.client.first_name} ${booking.client.last_name}`.trim()
    : 'Client';

  const when = view === 'today' ? format(start, 'h:mm a') : format(start, 'EEE, MMM d · h:mm a');

  return (
    <li>
      <Link
        href={`/dashboard/events/${booking.id}`}
        className={cn(
          'group relative flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-sm ring-1 ring-black/5',
          'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 ring-1 ring-black/5">
              <IconCalendar className="h-5 w-5 text-gray-700" />
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                <span className="truncate">{clientName || 'Client'}</span>
                <span className="text-gray-300">•</span>
                <span className="whitespace-nowrap">{when}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full bg-black/5 px-3 py-1 text-[11px] font-semibold text-gray-700 sm:inline-flex">
            View
          </span>
          <IconArrowRight className="h-5 w-5 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-600" />
        </div>
      </Link>
    </li>
  );
}

/* --------- Page --------- */
export default function TodayPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<ViewMode>('today');

  // Redirect non-artists, copy the pattern from ArtistDashboardPage
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

  const { loading, error, bookings, bookingRequests } = useArtistDashboardData(user?.id);
  const { count: unreadThreads } = useUnreadThreadsCount();

  const now = useMemo(() => new Date(), []);
  const upcomingEnd = useMemo(() => addDays(now, 7), [now]);

  const safeBookings: Booking[] = bookings ?? [];
  const safeRequests: BookingRequest[] = bookingRequests ?? [];

  const todayBookings = useMemo(
    () => safeBookings.filter((b) => isToday(new Date(b.start_time))),
    [safeBookings],
  );

  const upcomingSoon = useMemo(
    () =>
      safeBookings
        .filter((b) => isWithinInterval(new Date(b.start_time), { start: now, end: upcomingEnd }))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [safeBookings, now, upcomingEnd],
  );

  const actionableRequests = useMemo(
    () => safeRequests.filter((r) => r.status === 'pending_quote' || r.status === 'quote_provided'),
    [safeRequests],
  );

  const stats = useMemo(
    () => [
      {
        label: 'Bookings Today',
        value: todayBookings.length,
        hint: todayBookings.length > 0 ? 'Confirmed gigs scheduled for today' : 'No shows booked today',
        icon: IconSparkles,
      },
      {
        label: 'Next 7 Days',
        value: upcomingSoon.length,
        hint: 'Confirmed bookings in the next week',
        icon: IconCalendar,
      },
      {
        label: 'Quotes to Answer',
        value: actionableRequests.length,
        hint: 'Booking requests waiting for a quote',
        icon: IconBolt,
      },
      {
        label: 'Unread Messages',
        value: unreadThreads,
        hint: unreadThreads > 0 ? 'Head to your inbox to reply' : 'You are all caught up',
        icon: IconChat,
      },
    ],
    [todayBookings.length, upcomingSoon.length, actionableRequests.length, unreadThreads],
  );

  const activeList = useMemo(
    () => (view === 'today' ? todayBookings : upcomingSoon),
    [view, todayBookings, upcomingSoon],
  );

  const hasBookings = activeList.length > 0;
  const dateLine = useMemo(() => format(now, 'EEEE, MMM d, yyyy'), [now]);

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
        <div className="relative">
          <BackgroundBlobs />
          <TodaySkeleton />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="relative">
          <BackgroundBlobs />
          <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-3xl items-center px-4 py-10">
            <div className="w-full rounded-3xl border border-red-200/60 bg-red-50/70 p-6 shadow-sm ring-1 ring-red-200/60 backdrop-blur">
              <p className="text-sm font-semibold text-red-900">Something went wrong</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/dashboard/artist"
                  className="inline-flex items-center rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-black hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                >
                  Open artist dashboard
                </Link>
                <Link
                  href="/dashboard/bookings"
                  className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                >
                  View bookings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="relative">
        <BackgroundBlobs />

        <div className="mx-auto min-h-[calc(100vh-120px)] max-w-6xl px-4 py-8">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-white/70 p-6 shadow-sm ring-1 ring-black/5 backdrop-blur">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Today</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                  {dateLine}
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  A quick snapshot of your schedule and what needs attention.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/dashboard/artist"
                  className={cn(
                    'inline-flex items-center justify-center rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm',
                    'transition hover:bg-black hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
                  )}
                >
                  Open artist dashboard
                </Link>
                <Link
                  href="/dashboard/bookings"
                  className={cn(
                    'inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-black/5',
                    'transition hover:bg-gray-50 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20',
                  )}
                >
                  View all bookings
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} icon={s.icon} />
              ))}
            </div>

            {/* subtle shine */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/40 blur-2xl" />
          </div>

          {/* Tabs + schedule */}
          <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row sm:items-center">
            <Segmented
              view={view}
              onChange={setView}
              todayCount={todayBookings.length}
              upcomingCount={upcomingSoon.length}
            />

            <p className="text-xs text-gray-600">
              Showing <span className="font-semibold text-gray-900">{activeList.length}</span>{' '}
              {view === 'today' ? 'booking(s) for today' : 'booking(s) in the next 7 days'}.
            </p>
          </div>

          {/* Main content */}
          {!hasBookings ? (
            <div className="mt-6 overflow-hidden rounded-3xl border border-dashed border-black/10 bg-white/60 p-8 shadow-sm ring-1 ring-black/5 backdrop-blur">
              <IllustratedEmpty
                variant="bookings"
                title="No bookings here (yet)"
                description="Once a client confirms a booking, it’ll show up here for today or your upcoming schedule."
                className="mx-auto max-w-md"
              />
              <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-xs text-gray-600">
                  Tip: Keep an eye on quotes—new requests can land anytime.
                </p>
                <Link
                  href="/dashboard/artist"
                  className="inline-flex items-center rounded-full bg-gray-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20"
                >
                  Review requests & messages
                  <IconArrowRight className="ml-1.5 h-4 w-4 text-white/80" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-black/5 bg-white/70 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
              <div className="flex items-center justify-between px-3 pb-2 pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">
                  {view === 'today' ? "Today's schedule" : 'Next 7 days'}
                </p>

                <Link
                  href="/dashboard/bookings"
                  className="text-xs font-semibold text-gray-700 transition hover:text-gray-900 hover:underline"
                >
                  View all
                </Link>
              </div>

              <ul className="space-y-2 p-2">
                {activeList.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} view={view} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
