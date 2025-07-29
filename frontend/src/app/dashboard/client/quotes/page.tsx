'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyClientQuotes } from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import { Spinner } from '@/components/ui';
import type { Quote } from '@/types';

export default function ClientQuotesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
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
        <div className="p-8">
          Please{' '}
          <Link
            href="/login"
            className="text-brand-dark no-underline hover:no-underline"
          >
            log in
          </Link>{' '}
          to view your quotes.
        </div>
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

  const badgeClasses = (status: string) => {
    switch (status) {
      case 'accepted_by_client':
        return 'bg-green-100 text-green-800';
      case 'rejected_by_client':
        return 'bg-red-100 text-red-800';
      case 'confirmed_by_artist':
        return 'bg-brand-light text-brand-dark';
      case 'withdrawn_by_artist':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

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
            <option value="declined">Declined</option>
          </select>
        </div>
        {quotes.length === 0 ? (
          <p>No quotes yet.</p>
        ) : (
          <ul className="space-y-3">
            {quotes.map((q) => (
              <li key={q.id} className="bg-white p-4 shadow rounded-lg">
                <div className="font-medium text-gray-900">{q.quote_details}</div>
                <div className="mt-2 flex justify-between items-center">
                  <span
                    className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${badgeClasses(q.status)}`}
                  >
                    {formatStatus(q.status)}
                  </span>
                  <Link
                    href={`/quotes/${q.id}`}
                    className="text-brand-dark hover:underline text-sm"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
