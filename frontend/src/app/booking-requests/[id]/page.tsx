'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import MessageThread from '@/components/booking/MessageThread';
import PersonalizedVideoFlow from '@/components/booking/PersonalizedVideoFlow';
import { getBookingRequestById, getArtist } from '@/lib/api';
import { BookingRequest } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function BookingRequestDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchRequest = async () => {
      try {
        const res = await getBookingRequestById(id);
        setRequest(res.data);
        const artistId = res.data.artist_id;
        try {
          const artistRes = await getArtist(artistId);
          setArtistAvatar(artistRes.data.profile_picture_url ?? null);
        } catch (err) {
          console.error('Failed to load artist profile', err);
        }
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
        <div className="space-y-1 text-sm text-gray-700">
          {request.client && (
            <p>
              <span className="font-medium">Client:</span> {request.client.first_name}{' '}
              {request.client.last_name} ({request.client.email})
            </p>
          )}
          {request.service && (
            <p>
              <span className="font-medium">Service:</span> {request.service.title}
            </p>
          )}
          {request.proposed_datetime_1 && (
            <p>
              <span className="font-medium">Proposed:</span>{' '}
              {new Date(request.proposed_datetime_1).toLocaleString()}
            </p>
          )}
        </div>
        {request.message && (
          <p className="border p-2 bg-white rounded-md whitespace-pre-wrap">
            {request.message}
          </p>
        )}
        {request.service?.service_type === 'Personalized Video' ? (
          <PersonalizedVideoFlow
            bookingRequestId={request.id}
            clientName={request.client?.first_name}
            artistName={
              request.artist?.business_name || request.artist?.user.first_name
            }
            artistAvatarUrl={artistAvatar}
          />
        ) : (
          <MessageThread
            bookingRequestId={request.id}
            clientName={request.client?.first_name}
            artistName={
              request.artist?.business_name || request.artist?.user.first_name
            }
            artistAvatarUrl={artistAvatar}
          />
        )}
      </div>
    </MainLayout>
  );
}
