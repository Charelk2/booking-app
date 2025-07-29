'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import MessageThread from '@/components/booking/MessageThread';
import { Spinner } from '@/components/ui';
import { getBookingRequestById, getArtist } from '@/lib/api';
import { BookingRequest } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function ThreadPage() {
  const params = useParams();
  const id = Number(params.threadId);
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
        setError('Failed to load conversation');
      }
    };
    fetchRequest();
  }, [id]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view this conversation.</div>
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
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  const isParticipant =
    user.id === request.client_id || user.id === request.artist_id;
  if (!isParticipant) {
    return (
      <MainLayout>
        <div className="p-8">You are not authorized to view this conversation.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4">
        <MessageThread
          bookingRequestId={request.id}
          serviceId={request.service_id ?? undefined}
          clientName={request.client?.first_name}
          artistName={
            request.artist?.business_name || request.artist?.user?.first_name
          }
          artistAvatarUrl={artistAvatar}
          serviceName={request.service?.title}
          initialNotes={request.message ?? null}
        />
      </div>
    </MainLayout>
  );
}
