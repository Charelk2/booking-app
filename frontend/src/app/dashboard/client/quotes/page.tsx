'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyClientQuotes } from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import { statusChipStyles } from '@/components/ui/status';
import { Spinner } from '@/components/ui';
import type { QuoteV2 } from '@/types';

export default function ClientQuotesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!user) return;
    const fetchQuotes = async () => {
      try {
        const res = await getMyClientQuotes(
          statusFilter ? { status: statusFilter } : {},
        );
        setQuotes(res.data);
      } catch (err) {
        console.error('Failed to load client quotes', err);
        setError('Failed to load quotes');
      } finally {
        setLoading(false);
      }
    };
    if (user.user_type === 'client') {
      fetchQuotes();
    } else {
      setLoading(false);
      setError('Access denied');
    }
  }, [user, statusFilter]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view your quotes.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  // statusChipStyles provides consistent soft badge styling

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">My Quotes</h1>
        <div className="mb-2">
          <label htmlFor="status" className="mr-2 text-sm">
            Filter:
          </label>
          <select
            id="status"
            className="border rounded-md p-1 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        {quotes.length === 0 ? (
          <p>No quotes yet.</p>
        ) : (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li key={q.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {Array.isArray(q.services) ? q.services.map((s) => s.description).join(', ') : 'Quote'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{formatStatus(q.status)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className="inline-flex items-center font-medium"
                      style={statusChipStyles(q.status)}
                    >
                      {formatStatus(q.status)}
                    </span>
                    <div className="mt-2">
                      <Link href={`/quotes/${q.id}`} className="text-brand-dark hover:underline text-sm">View</Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
