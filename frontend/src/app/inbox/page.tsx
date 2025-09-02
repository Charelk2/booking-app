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
  getThreadsIndex,
  getMessagesForBookingRequest,
  ensureBookaThread,
  getMyBookingRequests,
  getBookingRequestsForArtist,
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
  // Ensure we only attempt to create a Booka thread once per mount
  const ensureTriedRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < BREAKPOINT_MD);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchAllRequests = useCallback(async () => {
    // Only show the page-level spinner if we have nothing yet
    setLoadingRequests((prev) => prev || allBookingRequests.length === 0);
    // Unified threads index (server-composed) when enabled
    try {
      if (process.env.NEXT_PUBLIC_INBOX_THREADS_INDEX === '1') {
        const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
        const res = await getThreadsIndex(role as any, 100);
        const items = res.data.items || [];
        const isArtist = user?.user_type === 'service_provider';
        const mapped: BookingRequest[] = items.map((it) => ({
          id: it.thread_id,
          client_id: 0 as any,
          service_provider_id: 0 as any,
          status: (it.state as any) || 'pending_quote',
          created_at: it.last_message_at,
          updated_at: it.last_message_at,
          last_message_content: it.last_message_snippet,
          last_message_timestamp: it.last_message_at,
          is_unread_by_current_user: (it.unread_count || 0) > 0 as any,
          message: null,
          travel_mode: null,
          travel_cost: null,
          travel_breakdown: null,
          proposed_datetime_1: (it.meta as any)?.event_date || null,
          proposed_datetime_2: null,
          attachment_url: null,
          service_id: undefined,
          service: undefined,
          artist: undefined as any,
          artist_profile: (!isArtist ? ({ business_name: it.counterparty_name, profile_picture_url: it.counterparty_avatar_url || undefined } as any) : undefined),
          client: (isArtist ? ({ first_name: it.counterparty_name, profile_picture_url: it.counterparty_avatar_url || undefined } as any) : undefined),
          accepted_quote_id: null,
          sound_required: undefined as any,
          ...(it.counterparty_name === 'Booka' ? { is_booka_synthetic: true } : {}),
          ...(it.state ? { thread_state: it.state } : {}),
        } as any));
        setAllBookingRequests(mapped);
        setError(null);
        setLoadingRequests(false);
        return;
      }
    } catch (e) {
      // fall through to legacy merge path
    }
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
      // Overlay moderation previews from the threads preview endpoint directly onto existing rows
      try {
        const role = user?.user_type === 'service_provider' ? 'artist' : 'client';
        const preview = await getMessageThreadsPreview(role as any, 50);
        const items = preview.data?.items || [];
        if (items.length > 0) {
          const byId = new Map<number, BookingRequest>(combined.map((r) => [r.id, r] as [number, BookingRequest]));
          for (const it of items) {
            const id = (it as any).thread_id as number;
            const r = byId.get(id);
            if (!r) continue;
            const text = String(it.last_message_preview || '');
            const isBooka = String((it as any).counterparty?.name || '') === 'Booka' || /^(\s*listing\s+approved:|\s*listing\s+rejected:)/i.test(text);
            // Always capture thread state from preview for row logic (e.g., hide INQUIRY once requested)
            (r as any).thread_state = (it as any).state || null;
            // Optionally mirror unread count for accuracy
            (r as any).unread_count = (it as any).unread_count ?? (r as any).unread_count;
            if (isBooka) {
              (r as any).last_message_content = it.last_message_preview;
              (r as any).last_message_timestamp = it.last_ts;
              (r as any).is_booka_synthetic = true; // hint for Booka display
            }
          }
          // If we have no booking requests yet, synthesize rows from previews so Booka appears in Inbox
          if (combined.length === 0) {
            const synth: BookingRequest[] = [] as any;
            for (const it of items) {
              const text = String(it.last_message_preview || '');
              const isBooka = String((it as any).counterparty?.name || '') === 'Booka' || /^(\s*listing\s+approved:|\s*listing\s+rejected:)/i.test(text);
              if (!isBooka) continue;
              const id = (it as any).thread_id as number;
              synth.push({
                id,
                client_id: 0,
                service_provider_id: 0 as any,
                status: 'pending_quote' as any,
                created_at: String(it.last_ts || new Date().toISOString()),
                updated_at: String(it.last_ts || new Date().toISOString()),
                last_message_content: 'Booka update',
                last_message_timestamp: it.last_ts,
                is_unread_by_current_user: true as any,
                message: null,
                travel_mode: null,
                travel_cost: null,
                travel_breakdown: null,
                proposed_datetime_1: null,
                proposed_datetime_2: null,
                attachment_url: null,
                service_id: undefined,
                service: undefined,
                artist: undefined as any,
                artist_profile: undefined as any,
                client: undefined as any,
                accepted_quote_id: null,
                sound_required: undefined as any,
                // Hints for UI overrides
                ...( { is_booka_synthetic: true, thread_state: (it as any).state || null } as any ),
              } as any);
            }
            if (synth.length > 0) {
              synth.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                                     new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
              combined = synth;
            }
          }
        }
      } catch {}

      // Secondary zero-state fallback: synthesize from message thread notifications
      if (combined.length === 0) {
        try {
          const t = await getMessageThreads();
          const items = (t.data || []) as any[];
          const synth: BookingRequest[] = [] as any;
          for (const th of items) {
            const id = Number((th as any).booking_request_id);
            if (!id) continue;
            const text = String(th.last_message || '').trim();
            const last_ts = String(th.timestamp || new Date().toISOString());
            const isBooka = /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
            synth.push({
              id,
              client_id: 0,
              service_provider_id: 0 as any,
              status: 'pending_quote' as any,
              created_at: last_ts,
              updated_at: last_ts,
              last_message_content: isBooka ? 'Booka update' : text,
              last_message_timestamp: last_ts,
              is_unread_by_current_user: Number(th.unread_count || 0) > 0,
              message: null,
              travel_mode: null,
              travel_cost: null,
              travel_breakdown: null,
              proposed_datetime_1: null,
              proposed_datetime_2: null,
              attachment_url: null,
              service_id: undefined,
              service: undefined,
              artist: undefined as any,
              artist_profile: undefined as any,
              client: undefined as any,
              accepted_quote_id: null,
              sound_required: undefined as any,
              ...( isBooka ? { is_booka_synthetic: true } : {} ),
            } as any);
          }
          if (synth.length > 0) {
            synth.sort((a, b) => new Date(String((b as any).last_message_timestamp || b.updated_at || b.created_at)).getTime() -
                                   new Date(String((a as any).last_message_timestamp || a.updated_at || a.created_at)).getTime());
            combined = synth;
          }
        } catch {}
      }

      // Fallback: if preview overlay missed, inspect last chat messages for recent threads (best-effort)
      try {
        // Check up to 8 most recent rows and patch moderation previews if found
        const sample = [...combined]
          .sort((a, b) => new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
                          new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime())
          .slice(0, 8);
        const results = await Promise.allSettled(
          sample.map(async (r) => {
            const res = await getMessagesForBookingRequest(r.id);
            const msgs = res.data || [];
            // Detect Booka moderation update based on the last message
            const last = msgs[msgs.length - 1];
            let moderation: { id: number; text: string; ts: string } | null = null;
            if (last && last.content) {
              const text = String(last.content || '').trim();
              if (/^(listing\s+approved:|listing\s+rejected:)/i.test(text)) {
                moderation = { id: r.id, text: 'Booka update', ts: last.timestamp } as const;
              }
            }
            // Detect explicit inquiry card anywhere in the message list
            const hasInquiryCard = Array.isArray(msgs) && msgs.some((m) => {
              const raw = (m && (m as any).content) ? String((m as any).content) : '';
              return raw.includes('inquiry_sent_v1');
            });
            return { moderation, hasInquiryCard } as const;
          })
        );
        const found: Array<{ moderation: { id: number; text: string; ts: string } | null; hasInquiryCard: boolean } | null> =
          results.map((r) => r.status === 'fulfilled' ? r.value : null);
        const byId = new Map<number, BookingRequest>(combined.map((r) => [r.id, r] as [number, BookingRequest]));
        for (let i = 0; i < sample.length; i++) {
          const res = found[i];
          const r = sample[i];
          if (!res) continue;
          const target = byId.get(r.id);
          if (!target) continue;
          if (res.moderation) {
            (target as any).last_message_content = res.moderation.text;
            (target as any).last_message_timestamp = res.moderation.ts;
            (target as any).is_booka_synthetic = true;
          }
          if (res.hasInquiryCard) {
            (target as any).has_inquiry_card = true;
          }
        }
      } catch {}

      combined.sort(
        (a, b) =>
          new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
          new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime(),
      );
      setAllBookingRequests(combined);

      // If artist has zero threads, attempt to ensure a Booka thread exists once
      try {
        if (!ensureTriedRef.current && (user?.user_type === 'service_provider') && combined.length === 0) {
          ensureTriedRef.current = true;
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id;
          if (realId) {
            // Refetch to include the new thread
            const mineRes2 = await getMyBookingRequests();
            let artistRes2: AxiosResponse<BookingRequest[]> = { data: [] } as unknown as AxiosResponse<BookingRequest[]>;
            try { artistRes2 = await getBookingRequestsForArtist(); } catch {}
            const combined2 = [...mineRes2.data, ...artistRes2.data].reduce<BookingRequest[]>((acc, req) => {
              if (!acc.find((r) => r.id === req.id)) acc.push(req);
              return acc;
            }, []);
            combined2.sort(
              (a, b) =>
                new Date(String((b as any).last_message_timestamp ?? b.updated_at ?? b.created_at)).getTime() -
                new Date(String((a as any).last_message_timestamp ?? a.updated_at ?? a.created_at)).getTime(),
            );
            setAllBookingRequests(combined2);
          }
        }
      } catch {
        // best-effort only
      }
    } catch (err: unknown) {
      console.error('Failed to load booking requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoadingRequests(false);
    }
  }, [user?.user_type, allBookingRequests.length]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace('/login?redirect=/inbox');
      } else {
        fetchAllRequests();
      }
    }
  }, [authLoading, user, router, fetchAllRequests]);

  // Refresh list on window focus / tab visibility change so previews update
  useEffect(() => {
    const onFocus = () => {
      fetchAllRequests();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchAllRequests();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAllRequests]);

  // Select conversation based on URL param after requests load (desktop), but do not refetch
  useEffect(() => {
    if (!allBookingRequests.length) return;
    const isMobileScreen = typeof window !== 'undefined' && window.innerWidth < BREAKPOINT_MD;
    if (isMobileScreen) return;
    const urlId = Number(searchParams.get('requestId'));
    const isBooka = Boolean(searchParams.get('booka') || searchParams.get('bookasystem'));
    if (isBooka) {
      // Resolve or create the Booka thread and select it
      (async () => {
        try {
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id;
          if (realId) setSelectedBookingRequestId(realId);
        } catch {}
      })();
      return;
    }
    if (urlId && allBookingRequests.find((r) => r.id === urlId)) {
      setSelectedBookingRequestId(urlId);
    } else if (selectedBookingRequestId == null) {
      setSelectedBookingRequestId(allBookingRequests[0].id);
    }
  }, [allBookingRequests, searchParams, selectedBookingRequestId]);

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
    async (id: number) => {
      try {
        // If this is a Booka row, ensure a real thread exists and set URL alias
        const selected = allBookingRequests.find((r) => r.id === id) as any;
        const isBooka = Boolean(selected?.is_booka_synthetic);
        if (isBooka) {
          const res = await ensureBookaThread();
          const realId = res.data?.booking_request_id || id;
          id = realId;
          await fetchAllRequests();
        }
      } catch {}

      setSelectedBookingRequestId(id);
      const params = new URLSearchParams(searchParams.toString());
      const selected = allBookingRequests.find((r) => r.id === id) as any;
      const isBooka = Boolean(selected?.is_booka_synthetic);
      if (isBooka) {
        params.delete('requestId');
        params.set('booka', '1');
      } else {
        params.delete('booka');
        params.set('requestId', String(id));
      }
      router.replace(`?${params.toString()}`, { scroll: false });
      if (isMobile) setShowList(false);
    },
    [allBookingRequests, searchParams, isMobile, router, fetchAllRequests]
  );

  const handleBackToList = useCallback(() => {
    setShowList(true);
  }, []);

  if (authLoading || (loadingRequests && allBookingRequests.length === 0)) {
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
            className="w-full px-4 md:w-1/4 lg:w-1/4 border-gray-100 flex-shrink-0 h-full min-h-0 flex flex-col overflow-hidden border-gray-100"
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
                  height={listHeight}
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
