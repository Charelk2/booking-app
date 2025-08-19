// Your InboxPage.tsx
'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getMessageThreads,
} from '@/lib/api';
import { BREAKPOINT_MD } from '@/lib/breakpoints';
import { BookingRequest } from '@/types';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const [allBookingRequests, setAllBookingRequests] = useState<BookingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selectedBookingRequestId, setSelectedBookingRequestId] = useState<number | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < BREAKPOINT_MD : false,
  );
  const [showList, setShowList] = useState(true);
  const [query, setQuery] = useState('');
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [listHeight, setListHeight] = useState<number>(420);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < BREAKPOINT_MD);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAllRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const mineRes = await getMyBookingRequests();
      let artistRes: AxiosResponse<BookingRequest[]> = { data: [] } as unknown as AxiosResponse<BookingRequest[]>;
      if (user?.user_type === 'service_provider') {
        artistRes = await getBookingRequestsForArtist();
      }
      let combined = [...mineRes.data, ...artistRes.data].reduce<BookingRequest[]>((acc, req) => {
        if (!acc.find((r) => r.id === req.id)) acc.push(req);
        return acc;
      }, []);

      // Merge unread status from message-threads endpoint to ensure UI reflects reality
      try {
        const t = await getMessageThreads();
        const unreadSet = new Set<number>();
        (t.data || []).forEach((th) => {
          if ((th as any).booking_request_id && Number(th.unread_count || 0) > 0) {
            unreadSet.add(Number((th as any).booking_request_id));
          }
        });
        combined = combined.map((r) => ({
          ...r,
          is_unread_by_current_user:
            ((r as any).is_unread_by_current_user === true || (r as any).is_unread_by_current_user === 1 || (r as any).is_unread_by_current_user === '1' || (r as any).is_unread_by_current_user === 'true')
              ? true
              : unreadSet.has(r.id),
        }));
      } catch (e) {
        // best-effort; ignore errors and show existing flags
      }
      combined.sort(
        (a, b) =>
          new Date(b.last_message_timestamp ?? b.updated_at ?? b.created_at).getTime() -
          new Date(a.last_message_timestamp ?? a.updated_at ?? a.created_at).getTime(),
      );
      setAllBookingRequests(combined);
      const urlId = Number(searchParams.get('requestId'));
      const isMobileScreen =
        typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MD;
      if (!isMobileScreen) {
        if (urlId && combined.find((r) => r.id === urlId)) {
          setSelectedBookingRequestId(urlId);
        } else if (combined.length > 0) {
          setSelectedBookingRequestId(combined[0].id);
        }
      }
    } catch (err: unknown) {
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

  // Compute list height dynamically to avoid scroll within scroll
  useEffect(() => {
    const el = document.getElementById('conversation-list-body');
    if (!el) return;
    const compute = () => setListHeight(el.clientHeight || 420);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allBookingRequests;
    return allBookingRequests.filter((r) => {
      const name = (user?.user_type === 'service_provider'
        ? r.client?.first_name
        : r.artist_profile?.business_name || r.artist?.first_name || '')
        .toString()
        .toLowerCase();
      const preview = (r.last_message_content || r.service?.title || r.message || '')
        .toString()
        .toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [allBookingRequests, query, user]);

  const handleSelect = useCallback(
    (id: number) => {
      setSelectedBookingRequestId(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('requestId', String(id));
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `?${params.toString()}`);
      }

      if (isMobile) {
        setShowList(false);
      }
    },
    [searchParams, isMobile]
  );

  const handleBackToList = useCallback(() => {
    setShowList(true);
  }, []);

  if (authLoading || loadingRequests) {
    return (
      <MainLayout hideFooter={true}>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout hideFooter={true}>
        <div className="p-4 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  const selectedRequest = allBookingRequests.find((r) => r.id === selectedBookingRequestId) || null;

  return (
    <MainLayout fullWidthContent hideFooter={true}>
      {/* Lock inbox to viewport to prevent page scroll; headers stay visible */}
      <div
        className="fixed inset-x-0 bottom-0 flex flex-col md:flex-row overflow-hidden bg-white"
        style={{ top: isMobile && !showList ? 0 : 'var(--app-header-height, 64px)', zIndex: isMobile && !showList ? 60 : undefined }}
      >
        {(!isMobile || showList) && (
          <div
            id="conversation-list-wrapper"
            className="w-full px-4 md:w-1/4 lg:w-1/4 border-gray-100 flex-shrink-0 h-full min-h-0 flex flex-col overflow-y-auto border-gray-100"
          >
            <div className="p-3 sticky top-0 z-10 bg-white space-y-2 border-b border-gray-100">
              <h1 className="text-xl font-semibold">Messages</h1>
              <div className="relative">
                <input
                  type="text"
                  aria-label="Search conversations"
                  placeholder="Search by name or message"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="pointer-events-none absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
            </div>
            <div id="conversation-list-body" className="flex-1 min-h-0">
              {filteredRequests.length > 0 ? (
                <ConversationList
                  bookingRequests={filteredRequests}
                  selectedRequestId={selectedBookingRequestId}
                  onSelectRequest={handleSelect}
                  currentUser={user}
                  query={query}
                />
              ) : (
                <p className="p-6 text-center text-gray-500">No conversations found.</p>
              )}
            </div>
          </div>
        )}
        {(!isMobile || !showList) && (
          <div id="chat-thread" className="flex-1 relative min-h-0 overflow-hidden">
            {isMobile && (
              <button
                onClick={handleBackToList}
                aria-label="Back to conversations"
                className="absolute top-2 left-2 z-20 p-2 bg-white rounded-full shadow-md md:hidden"
              >
                <ArrowLeftIcon className="h-5 w-5 text-gray-700" />
              </button>
            )}
            {selectedBookingRequestId ? (
              <MessageThreadWrapper
                bookingRequestId={selectedBookingRequestId}
                bookingRequest={selectedRequest}
                setShowReviewModal={setShowReviewModal}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
                <p>Select a conversation to view messages.</p>
              </div>
            )}
          </div>
        )}
      </div>
      {selectedRequest && (
        <ReviewFormModal
          isOpen={showReviewModal}
          bookingId={
            (selectedRequest as { booking_id?: number | null }).booking_id ?? 0
          }
          onClose={() => setShowReviewModal(false)}
          onSubmitted={() => setShowReviewModal(false)}
        />
      )}
    </MainLayout>
  );
}
