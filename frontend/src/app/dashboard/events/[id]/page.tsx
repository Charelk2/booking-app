"use client";

import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { BookingProvider } from '@/contexts/BookingContext';
import EventPrepForm from './EventPrepForm';
import { useEffect, useState } from 'react';
import { getBookingDetails } from '@/lib/api';

export default function EventPrepPage() {
  const params = useParams();
  const id = Number((params as any)?.id);
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id || Number.isNaN(id)) throw new Error('bad id');
        await getBookingDetails(id);
        if (!mounted) return;
        setExists(true);
      } catch {
        if (!mounted) return;
        setExists(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  return (
    <MainLayout>
      <BookingProvider>
        <div className="mx-auto full-width px-3 sm:px-4 lg:px-6 py-6">
          <h1 className="text-2xl font-bold mb-4">Event Prep</h1>
          {exists === null ? (
            <div className="text-sm text-gray-600">Loading…</div>
          ) : exists ? (
            <EventPrepForm bookingId={id} />
          ) : (
            <div className="text-sm text-gray-600">Not found or you do not have access.</div>
          )}
        </div>
      </BookingProvider>
    </MainLayout>
  );
}
