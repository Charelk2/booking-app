// frontend/src/app/dashboard/provider/payouts/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ErrorState from '@/components/ui/ErrorState';
import { formatCurrency } from '@/lib/utils';

type Payout = {
  id: number;
  booking_id: number | null;
  amount: number;
  currency: string;
  status: 'queued' | 'paid' | 'failed' | 'blocked' | string;
  type: 'first50' | 'final50' | string;
  scheduled_at: string | null;
  paid_at: string | null;
  reference: string | null;
};

type Stats = {
  total_paid: number;
  total_pending: number;
  upcoming_count: number;
  last_payout_at: string | null;
  next_payout_at: string | null;
};

export default function ProviderPayoutsPage() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayouts = async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
        const res = await fetch(apiUrl(`/api/v1/payouts/me${qs}`), {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load payouts');
        const data = await res.json();
        setPayouts(data.items || []);
        setStats(data.stats || null);
      } catch (e: any) {
        setError(e.message || 'Failed to load payouts');
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchPayouts();
  }, [user, statusFilter]);

  if (!user) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto p-4">
          <p className="text-sm text-gray-600">You need to log in to view payouts.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-semibold">Payouts</h1>
            <p className="text-sm text-gray-600">
              Track your 50/50 payouts for each confirmed booking.
            </p>
          </div>
        </div>

        {loading && <LoadingSkeleton lines={8} />}
        {error && !loading && <ErrorState message={error} onRetry={() => setStatusFilter(statusFilter)} />}

        {!loading && !error && (
          <>
            {/* Summary cards */}
            {stats && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <SummaryCard
                  label="Total paid out"
                  value={formatCurrency(stats.total_paid)}
                  helper={stats.last_payout_at ? `Last paid ${format(new Date(stats.last_payout_at), 'MMM d, yyyy')}` : 'No payouts yet'}
                />
                <SummaryCard
                  label="Pending payouts"
                  value={formatCurrency(stats.total_pending)}
                  helper={
                    stats.upcoming_count > 0
                      ? `${stats.upcoming_count} pending ${stats.next_payout_at ? `• next around ${format(new Date(stats.next_payout_at), 'MMM d')}` : ''}`
                      : 'No pending payouts'
                  }
                />
                <SummaryCard
                  label="Bank details"
                  value="Manage"
                  helper="Update your payout details"
                  href="/dashboard/profile/edit#banking"
                />
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-2 mb-3 text-sm">
              <span className="text-gray-600">Status:</span>
              {['all', 'queued', 'paid', 'failed', 'blocked'].map((s) => {
                const val = s === 'all' ? null : s;
                const active = statusFilter === val;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(val)}
                    className={`rounded-full px-3 py-1 border text-xs ${
                      active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Stage</Th>
                    <Th>Booking</Th>
                    <Th>Amount</Th>
                    <Th>Status</Th>
                    <Th>Scheduled</Th>
                    <Th>Paid</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-sm text-gray-500">
                        No payouts yet. Once clients pay and your bookings complete, payouts will show here.
                      </td>
                    </tr>
                  )}
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <Td>
                        <StagePill type={p.type} />
                      </Td>
                      <Td>
                        {p.booking_id ? (
                          <Link href={`/dashboard/bookings?booking_id=${p.booking_id}`} className="text-xs text-brand-dark hover:underline">
                            Booking #{p.booking_id}
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </Td>
                      <Td>{formatCurrency(p.amount)}</Td>
                      <Td>
                        <StatusChip status={p.status} />
                      </Td>
                      <Td>{p.scheduled_at ? format(new Date(p.scheduled_at), 'MMM d, yyyy') : '—'}</Td>
                      <Td>{p.paid_at ? format(new Date(p.paid_at), 'MMM d, yyyy') : '—'}</Td>
                      <Td>
                        <a
                          href={apiUrl(`/api/v1/payouts/${p.id}/pdf`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-dark hover:underline"
                        >
                          Remittance PDF
                        </a>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}

// Small helpers
const Th = (props: any) => (
  <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
    {props.children}
  </th>
);
const Td = (props: any) => (
  <td className="px-4 py-2 align-middle text-[13px] text-gray-900 whitespace-nowrap">{props.children}</td>
);

function StagePill({ type }: { type: string }) {
  const label = type === 'first50' ? 'First 50%' : type === 'final50' ? 'Final 50%' : 'Payout';
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const theme =
    normalized === 'paid'
      ? 'bg-green-50 text-green-700 border-green-200'
      : normalized === 'queued'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : normalized === 'failed' || normalized === 'blocked'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-gray-50 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${theme}`}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  href,
}: {
  label: string;
  value: string;
  helper?: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition">
      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
      {helper && <div className="mt-1 text-xs text-gray-500">{helper}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
 