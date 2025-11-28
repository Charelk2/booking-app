'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import toast from '@/components/ui/Toast';
import {
  getMyArtistQuotes,
  withdrawQuoteV2,
} from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import { statusChipClass } from '@/components/ui/status';
import type { QuoteV2 } from '@/types';
import { Spinner } from '@/components/ui';

export default function ArtistQuotesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    if (user.user_type !== 'service_provider') {
      setError('Access denied');
      setLoading(false);
      return;
    }
    const fetchQuotes = async () => {
      try {
        const res = await getMyArtistQuotes();
        setQuotes(res.data);
      } catch (err) {
        console.error('Failed to load quotes', err);
        setError('Failed to load quotes');
      } finally {
        setLoading(false);
      }
    };
    fetchQuotes();
  }, [user]);

  const handleWithdraw = async (id: number) => {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, status: 'rejected' } : q,
      ),
    );
    try {
      await withdrawQuoteV2(id);
      toast.success('Quote withdrawn');
    } catch (err) {
      console.error('Withdraw failed', err);
      toast.error(err instanceof Error ? err.message : 'Error withdrawing quote');
    }
  };

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

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">My Quotes</h1>
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
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusChipClass(q.status)}`}>{formatStatus(q.status)}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  {q.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => handleWithdraw(q.id)}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
