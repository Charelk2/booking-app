'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import QuoteCard from '@/components/booking/QuoteCard';
import { Spinner } from '@/components/ui';
import { getQuoteV2, updateQuoteAsClient, acceptQuoteV2 } from '@/lib/api';
import { QuoteV2 } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function QuoteDetailPage() {
  const params = useParams();
  const id = Number(params.quoteId);
  const { user } = useAuth();
  const [quote, setQuote] = useState<QuoteV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    const fetchQuote = async () => {
      try {
        const res = await getQuoteV2(id);
        setQuote(res.data);
      } catch (err) {
        console.error('Failed to load quote', err);
        setError('Failed to load quote');
      }
    };
    fetchQuote();
  }, [id]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view this quote.</div>
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

  if (!quote) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  const isParticipant =
    user.id === quote.client_id || user.id === quote.artist_id;
  if (!isParticipant) {
    return (
      <MainLayout>
        <div className="p-8">You are not authorized to view this quote.</div>
      </MainLayout>
    );
  }

  const handleAction = async (status: 'accepted_by_client' | 'rejected_by_client') => {
    if (!quote) return;
    setUpdating(true);
    try {
      if (status === 'accepted_by_client') {
        await acceptQuoteV2(quote.id);
      } else {
        await updateQuoteAsClient(quote.id, { status });
      }
      const res = await getQuoteV2(quote.id);
      setQuote(res.data);
    } catch (err) {
      console.error('Failed to update quote', err);
      setError('Failed to update quote');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-md mx-auto p-4">
        <h1 className="text-xl font-semibold mb-2">Quote #{quote.id}</h1>
        <QuoteCard
          quote={quote}
          isClient={user.user_type === 'client'}
          onAccept={() => handleAction('accepted_by_client')}
          onDecline={() => handleAction('rejected_by_client')}
          bookingConfirmed={false}
        />
        {updating && (
          <p className="text-sm mt-2" aria-live="polite">Updating...</p>
        )}
      </div>
    </MainLayout>
  );
}
