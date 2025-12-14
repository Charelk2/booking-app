// frontend/src/app/dashboard/provider/payouts/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';
import Button from '@/components/ui/Button';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import TimeAgo from '@/components/ui/TimeAgo';
import { formatCurrency } from '@/lib/utils';
import { colors, radii, spacing, typography } from '@/theme/tokens';
import { tableCellStyle, tableHeaderStyle } from '@/theme/table';
import { getPayoutStageLabel, getPayoutStatusTheme } from '@/theme/payoutStatus';

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
  total_blocked?: number;
  total_failed?: number;
  total_queued?: number;
  upcoming_count: number;
  blocked_count?: number;
  failed_count?: number;
  last_payout_at: string | null;
  next_payout_at: string | null;
};

type PayoutsResponse = {
  items: Payout[];
  stats: Stats | null;
  total: number;
  limit: number;
  offset: number;
};

type FetchError = {
  message: string;
  status?: number;
};

const PAGE_SIZE = 50;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

function getBackendErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const detail = body.detail;
  if (typeof detail === 'string') return detail;
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message;
  const message = body.message;
  if (typeof message === 'string') return message;
  return null;
}

function formatDateSafe(ts: string | null, fmt = 'MMM d, yyyy') {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, fmt);
}

export default function ProviderPayoutsPage() {
  const { user, loading: authLoading } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<FetchError | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef({ initial: false, more: false });

  const fetchPayouts = useCallback(
    async ({ offset, append }: { offset: number; append: boolean }) => {
      if (!user) return;

      // Avoid overlapping fetches.
      if (append) {
        if (inFlightRef.current.initial || inFlightRef.current.more) return;
        inFlightRef.current.more = true;
        setLoadingMore(true);
      } else {
        abortRef.current?.abort();
        inFlightRef.current.initial = true;
        setLoading(true);
      }

      setError(null);
      try {
        const search = new URLSearchParams();
        if (statusFilter) search.set('status', statusFilter);
        search.set('limit', String(PAGE_SIZE));
        search.set('offset', String(offset));

        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch(apiUrl(`/api/v1/payouts/me?${search.toString()}`), {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!res.ok) {
          let body: unknown = null;
          try {
            body = await res.json();
          } catch {
            // ignore
          }
          const backendMessage = getBackendErrorMessage(body);

          let message = backendMessage || 'Failed to load payouts';
          if (res.status === 401) message = 'Your session has expired. Please sign in again.';
          if (res.status === 403) message = backendMessage || 'You don’t have access to view payouts for this account.';
          throw Object.assign(new Error(message), { status: res.status });
        }

        const data = (await res.json()) as PayoutsResponse;
        const items = Array.isArray(data.items) ? data.items : [];

        setPayouts((prev) => (append ? [...prev, ...items] : items));
        setStats(data.stats || null);
        setTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : items.length);
        setLastUpdatedAt(new Date().toISOString());
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string; status?: number };
        if (e?.name === 'AbortError') return;
        setError({ message: e?.message || 'Failed to load payouts', status: e?.status });
      } finally {
        if (append) {
          inFlightRef.current.more = false;
          setLoadingMore(false);
        } else {
          inFlightRef.current.initial = false;
          setLoading(false);
        }
      }
    },
    [user, statusFilter],
  );

  useEffect(() => {
    if (!user) return;
    setPayouts([]);
    setTotal(0);
    setQuery('');
    void fetchPayouts({ offset: 0, append: false });
    return () => abortRef.current?.abort();
  }, [user, statusFilter, fetchPayouts]);

  const visiblePayouts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return payouts;
    return payouts.filter((p) => {
      const bookingId = p.booking_id != null ? String(p.booking_id) : '';
      const ref = (p.reference || '').toLowerCase();
      const type = (p.type || '').toLowerCase();
      const status = (p.status || '').toLowerCase();
      return (
        bookingId.includes(q) ||
        ref.includes(q) ||
        type.includes(q) ||
        status.includes(q)
      );
    });
  }, [payouts, query]);

  const hasMore = payouts.length < total;

  if (authLoading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="h-7 w-28 rounded bg-gray-200 animate-pulse" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-100 animate-pulse" />
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[92px] rounded-2xl border border-gray-200 bg-white shadow-sm animate-pulse" />
            ))}
          </div>
          <div className="mt-6 h-[420px] rounded-2xl border border-gray-200 bg-white shadow-sm animate-pulse" />
        </div>
      </MainLayout>
    );
  }

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
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payouts</h1>
            <p className="text-sm text-gray-600">
              Track your 50/50 payouts for each confirmed booking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdatedAt && (
              <div className="text-xs text-gray-500">
                Updated <TimeAgo timestamp={lastUpdatedAt} />
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              isLoading={loading}
              onClick={() => void fetchPayouts({ offset: 0, append: false })}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-semibold text-gray-900">How payouts work</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-600">
            <li>Each booking can produce multiple payout stages (e.g. First 50% and Final 50%).</li>
            <li>“Scheduled” dates are estimates and may move based on processing timelines.</li>
            <li>If anything is “Blocked” or “Failed”, review your payout method or contact support.</li>
          </ul>
        </div>

        {error && !loading && (
          <ErrorState
            message={error.message}
            onRetry={() => void fetchPayouts({ offset: 0, append: false })}
          />
        )}

        {/* Summary cards */}
        {stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <SummaryCard
              label="Total paid out"
              value={formatCurrency(stats.total_paid || 0)}
              helper={
                stats.last_payout_at
                  ? `Last payout ${formatDateSafe(stats.last_payout_at)}`
                  : 'No payouts yet'
              }
            />
            <SummaryCard
              label="Pending payouts"
              value={formatCurrency(stats.total_pending || 0)}
              helper={
                (stats.upcoming_count || 0) > 0
                  ? `${stats.upcoming_count || 0} scheduled${stats.next_payout_at ? ` • next ${formatDateSafe(stats.next_payout_at, 'MMM d')}` : ''}`
                  : 'No pending payouts'
              }
            />
            <SummaryCard
              label="Needs attention"
              value={formatCurrency((stats.total_blocked || 0) + (stats.total_failed || 0))}
              helper={
                (stats.blocked_count || 0) + (stats.failed_count || 0) > 0
                  ? `${(stats.blocked_count || 0) + (stats.failed_count || 0)} payout${(stats.blocked_count || 0) + (stats.failed_count || 0) === 1 ? '' : 's'} need review`
                  : 'All payouts look good'
              }
              onClick={
                (stats.blocked_count || 0) + (stats.failed_count || 0) > 0
                  ? () => setStatusFilter((stats.blocked_count || 0) > 0 ? 'blocked' : 'failed')
                  : undefined
              }
            />
            <SummaryCard
              label="Payout method"
              value="Manage"
              helper="Update your bank details"
              href="/dashboard/profile/edit#banking"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[92px] rounded-2xl border border-gray-200 bg-white shadow-sm animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Filters + list */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-100 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm font-semibold text-gray-900">Payout history</div>
              <div className="flex items-center gap-2">
                <div className="sm:hidden">
                  <select
                    value={statusFilter || 'all'}
                    onChange={(e) => setStatusFilter(e.target.value === 'all' ? null : e.target.value)}
                    className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900"
                  >
                    <option value="all">All</option>
                    <option value="queued">Scheduled</option>
                    <option value="paid">Paid</option>
                    <option value="blocked">Blocked</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search booking or reference…"
                  className="h-10 w-full sm:w-64 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10"
                />
              </div>
            </div>

            <div className="text-xs text-gray-500">
              {total > 0 ? `Loaded ${payouts.length} of ${total}` : ' '}
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-gray-600">Status:</span>
              {[
                { key: 'all', label: 'All', value: null },
                { key: 'queued', label: 'Scheduled', value: 'queued' },
                { key: 'paid', label: 'Paid', value: 'paid' },
                { key: 'blocked', label: 'Blocked', value: 'blocked' },
                { key: 'failed', label: 'Failed', value: 'failed' },
              ].map((s) => {
                const active = statusFilter === s.value;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStatusFilter(s.value)}
                    className={`rounded-full px-3 py-1 border text-xs ${
                      active
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading && payouts.length === 0 ? (
            <div className="p-4">
              <div className="h-4 w-44 rounded bg-gray-100 animate-pulse" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />
                ))}
              </div>
            </div>
          ) : visiblePayouts.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={payouts.length === 0 ? 'No payouts yet' : 'No results'}
                description={
                  payouts.length === 0
                    ? 'Once clients pay and your bookings complete, payouts will show here.'
                    : 'Try a different status or search term.'
                }
              />
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100">
                {visiblePayouts.map((p) => (
                  <div key={p.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <StagePill type={p.type} />
                        <div className="text-sm font-semibold text-gray-900">
                          {formatCurrency(p.amount, p.currency)}
                        </div>
                        {p.booking_id ? (
                          <Link
                            href={`/dashboard/bookings?booking_id=${p.booking_id}`}
                            className="text-xs text-brand-dark hover:underline"
                          >
                            Booking #{p.booking_id}
                          </Link>
                        ) : (
                          <div className="text-xs text-gray-400">No booking link</div>
                        )}
                      </div>
                      <StatusChip status={p.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <div>
                        <div className="text-gray-500">Scheduled</div>
                        <div className="font-medium text-gray-900">{formatDateSafe(p.scheduled_at)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Paid</div>
                        <div className="font-medium text-gray-900">{formatDateSafe(p.paid_at)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="text-xs text-gray-500 truncate">
                        {p.reference ? `Ref: ${p.reference}` : '—'}
                      </div>
                      <a
                        href={apiUrl(`/api/v1/payouts/${p.id}/pdf`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-brand-dark hover:underline"
                      >
                        PDF
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Stage</Th>
                      <Th>Booking</Th>
                      <Th>Amount</Th>
                      <Th>Status</Th>
                      <Th>Scheduled</Th>
                      <Th>Paid</Th>
                      <Th>Reference</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visiblePayouts.map((p) => (
                      <tr key={p.id}>
                        <Td>
                          <StagePill type={p.type} />
                        </Td>
                        <Td>
                          {p.booking_id ? (
                            <Link
                              href={`/dashboard/bookings?booking_id=${p.booking_id}`}
                              className="text-xs text-brand-dark hover:underline"
                            >
                              Booking #{p.booking_id}
                            </Link>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </Td>
                        <Td>{formatCurrency(p.amount, p.currency)}</Td>
                        <Td>
                          <StatusChip status={p.status} />
                        </Td>
                        <Td>{formatDateSafe(p.scheduled_at)}</Td>
                        <Td>{formatDateSafe(p.paid_at)}</Td>
                        <Td className="max-w-[180px] truncate">
                          {p.reference ? (
                            <span className="text-xs text-gray-700">{p.reference}</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <a
                            href={apiUrl(`/api/v1/payouts/${p.id}/pdf`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-brand-dark hover:underline"
                          >
                            Remittance PDF
                          </a>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div className="border-t border-gray-100 p-4 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={loadingMore}
                    onClick={() => void fetchPayouts({ offset: payouts.length, append: true })}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// Small helpers
const Th = ({
  className = '',
  children,
  ...props
}: PropsWithChildren<ThHTMLAttributes<HTMLTableCellElement>>) => (
  <th
    scope="col"
    className={className}
    style={tableHeaderStyle}
    {...props}
  >
    {children}
  </th>
);
const Td = ({
  className = '',
  children,
  ...props
}: PropsWithChildren<TdHTMLAttributes<HTMLTableCellElement>>) => (
  <td
    className={`align-middle whitespace-nowrap ${className}`}
    style={tableCellStyle}
    {...props}
  >
    {children}
  </td>
);

function StagePill({ type }: { type: string }) {
  const label = getPayoutStageLabel(type);
  return (
    <span
      className="inline-flex items-center border"
      style={{
        borderRadius: radii.pill,
        backgroundColor: colors.neutral.bg,
        borderColor: colors.neutral.border,
        color: colors.neutral.text,
        padding: `${spacing.xs} ${spacing.sm}`,
        fontSize: typography.tiny,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const palette = getPayoutStatusTheme(status);
  return (
    <span
      className="inline-flex items-center border font-medium"
      style={{
        borderRadius: radii.pill,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        color: palette.text,
        padding: `${spacing.xs} ${spacing.sm}`,
        fontSize: typography.tiny,
      }}
    >
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  href,
  onClick,
}: {
  label: string;
  value: string;
  helper?: string;
  href?: string;
  onClick?: () => void;
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
  if (onClick) {
    return (
      <button type="button" className="block text-left w-full" onClick={onClick}>
        {content}
      </button>
    );
  }
  return content;
}
