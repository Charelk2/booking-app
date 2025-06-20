'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import toast from '@/components/ui/Toast';
import {
  getMyArtistQuotes,
  updateQuoteAsArtist,
  confirmQuoteBooking,
} from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import type { Quote } from '@/types';
import EditQuoteModal from '@/components/booking/EditQuoteModal';
import { Spinner } from '@/components/ui';

export default function ArtistQuotesPage() {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    if (user.user_type !== 'artist') {
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
        q.id === id ? { ...q, status: 'withdrawn_by_artist' } : q,
      ),
    );
    try {
      await updateQuoteAsArtist(id, { status: 'withdrawn_by_artist' });
      toast.success('Quote withdrawn');
    } catch (err) {
      console.error('Withdraw failed', err);
      toast.error(err instanceof Error ? err.message : 'Error withdrawing quote');
    }
  };

  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);

  const handleEdit = (quote: Quote) => {
    setEditingQuote(quote);
  };

  const handleSaveEdit = async (data: { quote_details: string; price: number }) => {
    if (!editingQuote) return;
    const updated = { ...editingQuote, ...data };
    setQuotes((prev) => prev.map((q) => (q.id === editingQuote.id ? updated : q)));
    try {
      await updateQuoteAsArtist(editingQuote.id, data);
      toast.success('Quote updated');
    } catch (err) {
      console.error('Update failed', err);
      toast.error(err instanceof Error ? err.message : 'Error updating quote');
    } finally {
      setEditingQuote(null);
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await confirmQuoteBooking(id);
      setQuotes((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: 'confirmed_by_artist' } : q,
        ),
      );
    } catch (err) {
      console.error('Confirm booking error', err);
      toast.error(err instanceof Error ? err.message : 'Failed to confirm');
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
              <li key={q.id} className="bg-white p-4 shadow rounded-lg">
                <div className="font-medium text-gray-900">{q.quote_details}</div>
                <div className="text-sm text-gray-500">{formatStatus(q.status)}</div>
                <div className="mt-2 flex space-x-4">
                  {q.status === 'pending_client_action' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleWithdraw(q.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Withdraw
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(q)}
                        className="text-brand-dark hover:underline text-sm"
                      >
                        Edit
                      </button>
                    </>
                  )}
                  {q.status === 'accepted_by_client' && (
                    <button
                      type="button"
                      onClick={() => handleConfirm(q.id)}
                      className="text-green-600 hover:underline text-sm"
                    >
                      Confirm Booking
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <EditQuoteModal
        open={editingQuote !== null}
        onClose={() => setEditingQuote(null)}
        onSubmit={handleSaveEdit}
        quote={editingQuote ?? ({} as Quote)}
      />
    </MainLayout>
  );
}
