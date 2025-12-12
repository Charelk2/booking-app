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
        {exists === null ? (
          <div className="mx-auto max-w-lg p-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm text-sm text-gray-700">
              Loading…
            </div>
          </div>
        ) : exists ? (
          <EventPrepForm bookingId={id} />
        ) : (
          <div className="mx-auto max-w-lg p-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm text-sm text-gray-700">
              Not found or you do not have access.
            </div>
          </div>
        )}
      </BookingProvider>
    </MainLayout>
  );
}
