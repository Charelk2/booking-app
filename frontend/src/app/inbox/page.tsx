'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import ConversationList from '@/components/inbox/ConversationList';
import MessageThreadWrapper from '@/components/inbox/MessageThreadWrapper';
import {
  getMyBookingRequests,
  getBookingRequestsForArtist,
} from '@/lib/api';
import { BookingRequest } from '@/types';

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const [allBookingRequests, setAllBookingRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedBookingRequestId, setSelectedBookingRequestId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const fetchAllRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const [mineRes, artistRes] = await Promise.all([
        getMyBookingRequests(),
        getBookingRequestsForArtist(),
      ]);
      const combined = [...mineRes.data, ...artistRes.data].reduce<BookingRequest[]>((acc, req) => {
        if (!acc.find((r) => r.id === req.id)) acc.push(req);
        return acc;
      }, []);
      combined.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      setAllBookingRequests(combined);
      const urlId = Number(searchParams.get('requestId'));
      if (urlId && combined.find((r) => r.id === urlId)) {
        setSelectedBookingRequestId(urlId);
      } else if (combined.length > 0) {
        setSelectedBookingRequestId(combined[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load booking requests:', err);
      setError('Failed to load conversations');
    } finally {
      setLoadingRequests(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login?redirect=/inbox');
      } else {
        fetchAllRequests();
      }
    }
  }, [authLoading, user, router, fetchAllRequests]);

  const handleSelect = useCallback(
    (id: number) => {
      setSelectedBookingRequestId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('requestId', String(id));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  if (authLoading || loadingRequests) {
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
        <div className="p-4 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  const selectedRequest = allBookingRequests.find((r) => r.id === selectedBookingRequestId) || null;

  return (
    <MainLayout>
      <div className="flex flex-col md:flex-row h-[calc(100vh-64px)]">
        <div className="md:w-1/3 border-r border-gray-200 overflow-y-auto">
          <ConversationList
            bookingRequests={allBookingRequests}
            selectedRequestId={selectedBookingRequestId}
            onSelectRequest={handleSelect}
            currentUser={user!}
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <MessageThreadWrapper
            bookingRequestId={selectedBookingRequestId}
            bookingRequest={selectedRequest}
          />
        </div>
      </div>
    </MainLayout>
  );
}
