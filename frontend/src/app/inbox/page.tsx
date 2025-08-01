// Your InboxPage.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AxiosResponse } from 'axios';
import MainLayout from '@/components/layout/MainLayout';
// Corrected import path for AuthContext (assuming it's directly in contexts)
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';
import ConversationList from '@/components/inbox/ConversationList';
import MessageThreadWrapper from '@/components/inbox/MessageThreadWrapper';
import ReviewFormModal from '@/components/review/ReviewFormModal';
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
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  const fetchAllRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const mineRes = await getMyBookingRequests();
      let artistRes: AxiosResponse<BookingRequest[]> = { data: [] } as AxiosResponse<BookingRequest[]>;
      if (user?.user_type === 'artist') {
        artistRes = await getBookingRequestsForArtist();
      }
      const combined = [...mineRes.data, ...artistRes.data].reduce<BookingRequest[]>((acc, req) => {
        if (!acc.find((r) => r.id === req.id)) acc.push(req);
        return acc;
      }, []);
      combined.sort(
        (a, b) =>
          new Date(b.last_message_timestamp ?? b.updated_at ?? b.created_at).getTime() -
          new Date(a.last_message_timestamp ?? a.updated_at ?? a.created_at).getTime(),
      );
      setAllBookingRequests(combined);
      const urlId = Number(searchParams.get('requestId'));
      if (urlId && combined.find((r) => r.id === urlId)) {
        setSelectedBookingRequestId(urlId);
      } else if (combined.length > 0) {
        setSelectedBookingRequestId(combined[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load booking requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoadingRequests(false);
    }
  }, [searchParams, user]);

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
    <MainLayout fullWidthContent>
      {/* Add the padding directly to this div */}
      <div className="px-2 sm:px-4 lg:px-6 flex flex-col md:flex-row h-[calc(100vh-64px)] bg-gray-100">
        <div className="w-full md:w-1/4 lg:w-1/4 border-r border-gray-200 overflow-y-auto bg-white flex-shrink-0">
          <div className="sticky top-0 bg-white p-3 border-b border-gray-200 flex justify-between items-center z-10">
            <h1 className="text-xl font-semibold">Messages</h1>
            <button
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
              aria-label="Search messages"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </button>
          </div>
          {allBookingRequests.length > 0 ? (
            <ConversationList
              bookingRequests={allBookingRequests}
              selectedRequestId={selectedBookingRequestId}
              onSelectRequest={handleSelect}
              currentUser={user!}
            />
          ) : (
            <p className="p-6 text-center text-gray-500">No conversations yet.</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto relative">
          {selectedBookingRequestId ? (
            <MessageThreadWrapper
              bookingRequestId={selectedBookingRequestId}
              bookingRequest={selectedRequest}
              showReviewModal={showReviewModal}
              setShowReviewModal={setShowReviewModal}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
              <p>Select a conversation to view messages.</p>
            </div>
          )}
        </div>
      </div>
      {selectedRequest && (
        <ReviewFormModal
          isOpen={showReviewModal}
          bookingId={(selectedRequest as any).booking_id || 0}
          onClose={() => setShowReviewModal(false)}
          onSubmitted={() => setShowReviewModal(false)}
        />
      )}
    </MainLayout>
  );
}
