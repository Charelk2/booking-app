"use client";

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { BookingProvider } from '@/contexts/BookingContext';
import { getQuotesForBookingRequest, getMyClientBookings, getMyArtistBookings, getBookingDetails } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function EventFromRequestRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const requestId = Number((params as any)?.id || 0);

  useEffect(() => {
    let cancelled = false;
    if (!requestId || Number.isNaN(requestId)) return;
    (async () => {
      // 1) Try accepted quote → booking_id
      try {
        const list = await getQuotesForBookingRequest(requestId);
        if (cancelled) return;
        const arr = Array.isArray(list.data) ? list.data : [];
        const accepted = arr.find((q: any) => q?.status === 'accepted' && Number.isFinite(Number((q as any)?.booking_id)));
        const qBid = Number((accepted as any)?.booking_id || 0);
        if (qBid > 0) {
          router.replace(`/dashboard/events/${qBid}`);
          return;
        }
      } catch {}

      // 2) Try role-based bookings mapping by booking_request_id
      try {
        if (user?.user_type === 'client') {
          const list = await getMyClientBookings();
          if (cancelled) return;
          const arr = Array.isArray(list.data) ? list.data : [];
          const match = arr.find((b: any) => Number(b?.booking_request_id) === requestId);
          const mBid = Number((match as any)?.id || 0);
          if (mBid > 0) {
            router.replace(`/dashboard/events/${mBid}`);
            return;
          }
        } else if (user?.user_type === 'service_provider') {
          const list = await getMyArtistBookings();
          if (cancelled) return;
          const arr = Array.isArray(list.data) ? list.data : [];
          const match = arr.find((b: any) => Number(b?.booking_request_id) === requestId);
          const mBid = Number((match as any)?.id || 0);
          if (mBid > 0) {
            router.replace(`/dashboard/events/${mBid}`);
            return;
          }
        }
      } catch {}

      // 3) As a safety, if we cannot resolve, stay on page and show a light message
    })();
    return () => { cancelled = true; };
  }, [requestId, user?.user_type, router]);

  return (
    <MainLayout>
      <BookingProvider>
        <div className="mx-auto full-width px-3 sm:px-4 lg:px-6 py-6">
          <h1 className="text-2xl font-bold mb-2">Event Prep</h1>
          <p className="text-sm text-gray-600">Resolving your event…</p>
        </div>
      </BookingProvider>
    </MainLayout>
  );
}

