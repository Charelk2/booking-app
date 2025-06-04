'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import MessageThread from '@/components/booking/MessageThread';
import { getBookingRequestById } from '@/lib/api';
import { BookingRequest } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function BookingRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const { user } = useAuth();
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchRequest = async () => {
      try {
        const res = await getBookingRequestById(id);
        setRequest(res.data);
      } catch (err) {
        console.error('Failed to load booking request', err);
        setError('Failed to load request');
      }
    };
    fetchRequest();
  }, [id]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view this request.</div>
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

  if (!request) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          Loading...
        </div>
      </MainLayout>
    );
  }

  const isParticipant =
    user.id === request.client_id || user.id === request.artist_id;
  if (!isParticipant) {
    return (
      <MainLayout>
        <div className="p-8">You are not authorized to view this request.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">Booking Request #{request.id}</h1>
        {request.message && (
          <p className="border p-2 bg-white rounded-md">{request.message}</p>
        )}
        <MessageThread bookingRequestId={request.id} />
      </div>
    </MainLayout>
  );
}
