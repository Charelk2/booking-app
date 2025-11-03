'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SafeImage from '@/components/ui/SafeImage';

import { Booking, BookingRequest, QuoteV2 } from '@/types';
import * as api from '@/lib/api';
import { useAuth as useContextAuth } from '@/contexts/AuthContext';
import { getFullImageUrl } from '@/lib/utils';

import MessageThread from '@/components/chat/MessageThread/index.web';
import BookingDetailsPanel from '@/components/chat/BookingDetailsPanel';
import usePaymentModal from '@/hooks/usePaymentModal';
import InlineQuoteForm from '@/components/chat/InlineQuoteForm';
import { createQuoteV2, getQuotesForBookingRequest, getQuoteV2, getBookingIdForRequest } from '@/lib/api';
import BookingSummarySkeleton from '@/components/chat/BookingSummarySkeleton';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { counterpartyLabel } from '@/lib/names';
import { useQuotes, prefetchQuotesByIds } from '@/hooks/useQuotes';

interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

interface MessageThreadWrapperProps {
  bookingRequestId: number | null;
  bookingRequest: BookingRequest | null;
  setShowReviewModal: (show: boolean) => void;
  isActive?: boolean;
}

export default function MessageThreadWrapper({
  bookingRequestId,
  bookingRequest,
  setShowReviewModal,
  isActive = true,
}: MessageThreadWrapperProps) {
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState<Booking | null>(null);

  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const [parsedDetails, setParsedDetails] = useState<ParsedBookingDetails | null>(null);
  const [presenceHeader, setPresenceHeader] = useState<string>('');

  const [isUserArtist, setIsUserArtist] = useState(false);
  const { user } = useContextAuth();
  const router = useRouter();

  useEffect(() => {
    setIsUserArtist(Boolean(user && user.user_type === 'service_provider'));
  }, [user]);

  /** Mobile details sheet visibility */
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  /** Quotes for totals in the side panel */
  const { quotesById, ensureQuotesLoaded, setQuote } = useQuotes(Number(bookingRequestId || 0));
  const refreshQuotesForThread = useCallback(async () => {
    try {
      const res = await api.getQuotesForBookingRequest(Number(bookingRequestId || 0));
      const arr = Array.isArray(res.data) ? (res.data as any[]) : [];
      // Prefer v2 shape; best-effort normalize legacy
      for (const q of arr) {
        const isV2 = Array.isArray((q as any)?.services);
        const normalized = isV2 ? (q as any) : (await (async () => {
          try { const { toQuoteV2FromLegacy } = await import('@/hooks/useQuotes'); return toQuoteV2FromLegacy(q as any, { clientId: (bookingRequest as any)?.client_id }); } catch { return q as any; }
        })());
        if (normalized && typeof normalized.id === 'number') setQuote(normalized as any);
      }
    } catch { /* ignore */ }
  }, [bookingRequestId, setQuote, bookingRequest]);
  useEffect(() => {
    const ids: number[] = [];
    try {
      const arr = Array.isArray((bookingRequest as any)?.quotes) ? (bookingRequest as any).quotes : [];
      for (const q of arr) {
        const id = Number((q as any)?.id || 0);
        if (Number.isFinite(id) && id > 0) ids.push(id);
      }
      const accepted = Number((bookingRequest as any)?.accepted_quote_id || 0);
      if (Number.isFinite(accepted) && accepted > 0) ids.push(accepted);
    } catch {}
    if (ids.length) void prefetchQuotesByIds(ids);
  }, [bookingRequest]);

  /** Payment modal */
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(async ({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status ?? null);
      setPaymentAmount(amount ?? null);
      setReceiptUrl(url ?? null);
      // Refresh quotes and proactively hydrate booking_id for the accepted quote
      try {
        await refreshQuotesForThread();
        if (!bookingRequestId) return;
        // First, attempt a direct booking-id resolve for this thread
        try {
          const res = await getBookingIdForRequest(Number(bookingRequestId));
          const bid = Number((res.data as any)?.booking_id || 0);
          if (Number.isFinite(bid) && bid > 0) {
            try { sessionStorage.setItem(`bookingId:br:${bookingRequestId}`, String(bid)); } catch {}
            // We can stop here; no need to find accepted quote
            return;
          }
        } catch {}
        // Fetch quotes list to find the accepted quote id
        const list = await getQuotesForBookingRequest(Number(bookingRequestId || 0));
        const arr = Array.isArray(list.data) ? (list.data as any[]) : [];
        const accepted = arr.find((q: any) => String((q?.status || '').toLowerCase()).includes('accept'));
        const acceptedId = Number(accepted?.id || 0);
        if (Number.isFinite(acceptedId) && acceptedId > 0) {
          // Hydrate V2 for booking_id and cache it
          try {
            const v2 = await getQuoteV2(acceptedId);
            const bid = Number((v2.data as any)?.booking_id || 0);
            if (Number.isFinite(bid) && bid > 0) {
              try { sessionStorage.setItem(`bookingId:br:${bookingRequestId}`, String(bid)); } catch {}
            }
          } catch {}
        }
      } catch {}
    }, [refreshQuotesForThread]),
    useCallback(() => {}, []),
  );

  /** Close on ESC (mobile) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSidePanel(false);
    };
    if (showSidePanel) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSidePanel]);

  /** Back button closes the sheet first (mobile) */
  useEffect(() => {
    const handlePopState = () => {
      if (showSidePanel) setShowSidePanel(false);
      else router.back();
    };
    window.addEventListener('popstate', handlePopState);
    if (showSidePanel) window.history.pushState(null, '');
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSidePanel, router]);

  /** Lock background scroll while any overlay is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (showSidePanel || showQuoteModal || showDetailsModal) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = prev || '';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [showSidePanel, showQuoteModal, showDetailsModal]);

  const handleDownloadCalendar = useCallback(async () => {
    if (!confirmedBookingDetails?.id) return;
    try {
      const res = await api.downloadBookingIcs(confirmedBookingDetails.id);
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `booking-${confirmedBookingDetails.id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Calendar download error:', err);
    }
  }, [confirmedBookingDetails]);

  if (!bookingRequestId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
        <p>Select a conversation to view messages.</p>
      </div>
    );
  }

  // Detect Booka moderation system message
  const isBookaModeration = (() => {
    const text = (bookingRequest?.last_message_content || '').toString();
    const synthetic = Boolean((bookingRequest as any)?.is_booka_synthetic);
    const label = (bookingRequest as any)?.counterparty_label || '';
    return synthetic || label === 'Booka' || /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
  })();

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Unified header */}
      <header className="sticky top-0 z-10 bg-white text-gray-900 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between border-b border-gray-200 md:min-h-[64px]">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {bookingRequest ? (
            isBookaModeration ? (
              <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center text-base font-medium" aria-label="Booka system">
                B
              </div>
            ) : isUserArtist ? (
              (bookingRequest.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ? (
                <SafeImage
                  src={(bookingRequest.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) as string}
                  alt="Client avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center text-base font-medium text-white" aria-hidden>
                  {(counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'U') || 'U').charAt(0)}
                </div>
              )
            ) : (bookingRequest.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ? (
              <Link
                href={`/service-providers/${
                  (bookingRequest as any).service_provider_id ||
                  (bookingRequest as any).artist_id ||
                  (bookingRequest as any).artist?.id ||
                  (bookingRequest as any).artist_profile?.user_id ||
                  (bookingRequest as any).service?.service_provider_id ||
                  (bookingRequest as any).service?.artist_id ||
                  (bookingRequest as any).service?.artist?.user_id ||
                  ''
                }`}
                aria-label="Service Provider profile"
                className="flex-shrink-0"
              >
                <SafeImage
                  src={(bookingRequest.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) as string}
                  alt="Service Provider avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              </Link>
            ) : (
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base font-medium text-gray-600" aria-hidden>
                {(counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'U') || 'U').charAt(0)}
              </div>
            )
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200" aria-hidden />
          )}

          {/* Name + presence */}
          <div className="flex flex-col">
            <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
              {bookingRequest
                ? (isBookaModeration
                    ? 'Booka'
                    : counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'User') || 'User')
                : 'Messages'}
            </span>
            {presenceHeader && !isBookaModeration ? (
              <span className="text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis -mt-0.5">
                {presenceHeader}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-2 sm:px-4">
          <button
            type="button"
            onClick={() => setShowSidePanel((s) => !s)}
            aria-label={showSidePanel ? 'Hide details panel' : 'Show booking details'}
            className="px-3 py-1.5 border bg-gray-50 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <span className="text-sm font-medium text-gray-900">
              {showSidePanel ? 'Hide details' : 'Show details'}
            </span>
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row relative w-full">
        <div
          data-testid="thread-container"
          className={`flex-1 min-w-0 min-h-0 w-full transition-[width] duration-300 ease-in-out ${
            showSidePanel ? 'md:w-[calc(100%-300px)] lg:w-[calc(100%-360px)]' : 'md:w-full'
          }`}
        >
          <MessageThread
            bookingRequestId={bookingRequestId}
            initialBookingRequest={bookingRequest}
            isActive={isActive}
            serviceId={bookingRequest?.service_id ?? undefined}
            clientName={isUserArtist
              ? (counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'Client') || 'Client')
              : (user?.first_name ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}` : 'Client')}
            artistName={!isUserArtist
              ? (counterpartyLabel(bookingRequest as any, user ?? undefined, (bookingRequest as any)?.counterparty_label || 'Service Provider') || 'Service Provider')
              : (bookingRequest?.artist_profile?.business_name || (bookingRequest as any)?.artist?.business_name || (bookingRequest as any)?.artist?.first_name || 'Service Provider')}
            artistAvatarUrl={!isUserArtist
              ? ((bookingRequest?.artist_profile?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ?? null)
              : (bookingRequest?.artist_profile?.profile_picture_url ?? null)}
            clientAvatarUrl={isUserArtist
              ? ((bookingRequest?.client?.profile_picture_url || (bookingRequest as any)?.counterparty_avatar_url) ?? null)
              : (bookingRequest?.client?.profile_picture_url ?? null)}
            serviceName={bookingRequest?.service?.title}
            initialNotes={bookingRequest?.message ?? null}
            artistCancellationPolicy={bookingRequest?.artist_profile?.cancellation_policy ?? null}
            initialBaseFee={bookingRequest?.service?.price ? Number(bookingRequest.service.price) : undefined}
            initialTravelCost={bookingRequest && bookingRequest.travel_cost !== null && bookingRequest.travel_cost !== undefined ? Number(bookingRequest.travel_cost) : undefined}
            initialSoundNeeded={parsedDetails?.soundNeeded?.toLowerCase() === 'yes'}
            onBookingDetailsParsed={setParsedDetails}
            onBookingConfirmedChange={(confirmed: boolean, booking: any) => {
              setBookingConfirmed(confirmed);
              setConfirmedBookingDetails(booking);
            }}
            onPaymentStatusChange={(status: string, amount?: number, url?: string | null) => {
              setPaymentStatus(status);
              setPaymentAmount(amount ?? null);
              setReceiptUrl(url ?? null);
            }}
            onShowReviewModal={setShowReviewModal}
            onOpenDetailsPanel={() => setShowDetailsModal((s) => !s)}
            onOpenQuote={() => setShowQuoteModal(true)}
            onPayNow={(quote: any) => {
              try {
                const amt = Number(quote?.total || 0);
                const provider = bookingRequest?.artist_profile?.business_name || (bookingRequest as any)?.artist?.first_name || 'Service Provider';
                const serviceName = bookingRequest?.service?.title || undefined;
                if (amt > 0) openPaymentModal({ bookingRequestId, amount: amt, providerName: String(provider), serviceName: serviceName as any } as any);
              } catch {}
            }}
            onContinueEventPrep={async (threadId: number) => {
              try {
                const key = `bookingId:br:${threadId}`;
                // 1) Use cached booking id if available
                try {
                  const cached = sessionStorage.getItem(key);
                  const bid = cached ? Number(cached) : 0;
                  if (Number.isFinite(bid) && bid > 0) {
                    try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                    return;
                  }
                } catch {}
                // 2) Try direct resolver endpoint (fast path)
                try {
                  const res = await getBookingIdForRequest(Number(threadId));
                  const bid = Number((res.data as any)?.booking_id || 0);
                  if (Number.isFinite(bid) && bid > 0) {
                    try { sessionStorage.setItem(key, String(bid)); } catch {}
                    try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                    return;
                  }
                } catch {}
                // 3) Find accepted quote from local cache or fetch list
                const values = Object.values(quotesById || {}) as any[];
                let acceptedId = 0;
                for (const q of values) {
                  if (Number(q?.booking_request_id) === Number(threadId) && String((q?.status || '')).toLowerCase() === 'accepted') {
                    acceptedId = Number(q?.id || 0);
                    break;
                  }
                }
                if (!acceptedId) {
                  const list = await getQuotesForBookingRequest(Number(threadId || 0));
                  const arr = Array.isArray(list.data) ? (list.data as any[]) : [];
                  const accepted = arr.find((q: any) => String((q?.status || '').toLowerCase()).includes('accept'));
                  acceptedId = Number(accepted?.id || 0);
                }
                if (!Number.isFinite(acceptedId) || acceptedId <= 0) return;
                // 4) Hydrate V2 to obtain booking_id
                const v2 = await getQuoteV2(acceptedId);
                const bid = Number((v2.data as any)?.booking_id || 0);
                if (Number.isFinite(bid) && bid > 0) {
                  try { sessionStorage.setItem(key, String(bid)); } catch {}
                  try { window.location.href = `/dashboard/events/${bid}`; } catch {}
                }
              } catch {}
            }}
            isPaidOverride={paymentStatus === 'paid'}
            onPresenceUpdate={isBookaModeration ? undefined : (s) => setPresenceHeader(s.label)}
            /** KEY: hide composer on mobile when details sheet is open */
            isDetailsPanelOpen={showSidePanel}
            /** Disable composer for Booka system-only threads */
            disableComposer={isBookaModeration}
          />
        </div>

        {/* Desktop side panel */}
        <section
          id="reservation-panel-desktop"
          role="complementary"
          className={`hidden md:flex flex-col bg-white text-sm leading-6 transform transition-all duration-300 ease-in-out flex-shrink-0 md:static md:translate-x-0 md:overflow-y-auto ${
            showSidePanel
              ? 'border-l border-gray-200 md:w-[300px] lg:w-[360px] md:p-5 lg:p-6'
              : 'md:w-0 md:p-0 md:overflow-hidden'
          }`}
        >
          {bookingRequest ? (
            <BookingDetailsPanel
              bookingRequest={bookingRequest}
              parsedBookingDetails={parsedDetails}
              bookingConfirmed={bookingConfirmed}
              confirmedBookingDetails={confirmedBookingDetails}
              setShowReviewModal={setShowReviewModal}
              paymentModal={null}
              quotes={quotesById as Record<number, QuoteV2>}
              openPaymentModal={(args: { bookingRequestId: number; amount: number }) => {
                const provider =
                  (bookingRequest as any)?.service_provider_profile?.business_name ||
                  (bookingRequest as any)?.service_provider?.business_name ||
                  bookingRequest?.artist_profile?.business_name ||
                  (bookingRequest as any)?.artist?.first_name ||
                  'Service Provider';
                const serviceName = bookingRequest?.service?.title || undefined;
                openPaymentModal({ bookingRequestId: args.bookingRequestId, amount: args.amount, providerName: String(provider), serviceName: serviceName as any } as any);
              }}
            />
          ) : (
            <div className="mt-2">
              <BookingSummarySkeleton />
            </div>
          )}
        </section>

        {/* Mobile overlay backdrop */}
        {showSidePanel && (
          <div
            className="md:hidden fixed inset-0 z-[70] bg-black/30"
            onClick={() => setShowSidePanel(false)}
            aria-hidden="true"
          />
        )}

        {/* Mobile bottom sheet */}
        <section
          id="reservation-panel-mobile"
          role="complementary"
          aria-modal="true"
          className={`md:hidden fixed inset-x-0 bottom-0 z-[80] w-full bg-white shadow-2xl transform transition-transform duration-300 ease-out rounded-t-2xl text-sm leading-6 ${
            showSidePanel ? 'translate-y-0' : 'translate-y-full'
          } max-h-[85vh] h-[85vh] overflow-y-auto`}
        >
          <div className="sticky top-0 z-10 bg-white rounded-t-2xl px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
            <div
              className="mx-auto h-1.5 w-10 rounded-full bg-gray-300"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => setShowSidePanel(false)}
              aria-label="Close details"
              className="absolute right-2 top-2 p-2 rounded-full hover:bg-gray-100"
            >
              <XMarkIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          <div className="p-4">
            {bookingRequest ? (
              <BookingDetailsPanel
                bookingRequest={bookingRequest}
                parsedBookingDetails={parsedDetails}
                bookingConfirmed={bookingConfirmed}
                confirmedBookingDetails={confirmedBookingDetails}
                setShowReviewModal={setShowReviewModal}
                paymentModal={null}
                quotes={quotesById as Record<number, QuoteV2>}
                openPaymentModal={(args: { bookingRequestId: number; amount: number }) =>
                  openPaymentModal({ bookingRequestId: args.bookingRequestId, amount: args.amount } as any)
                }
              />
            ) : (
              <BookingSummarySkeleton variant="modal" />
            )}
          </div>
        </section>
      </div>

      {/* Create Quote modal */}
      {showQuoteModal && bookingRequest && (
        <div className="fixed inset-0 z-[90]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowQuoteModal(false)} aria-hidden="true" />
          {/* Centered container */}
          <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4 sm:pt-[calc(var(--app-header-height,64px)+8px)] sm:items-start">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quote-modal-title"
              className="relative z-[91] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
            >
              <div id="quote-modal-title" className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
                <div className="font-semibold">Create quote</div>
                <button
                  type="button"
                  className="rounded-full p-2 hover:bg-gray-100"
                  onClick={() => setShowQuoteModal(false)}
                  aria-label="Close"
                >
                  <span className="block h-5 w-5 text-gray-600">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <InlineQuoteForm
                  onSubmit={async (payload) => {
                    try {
                      const res = await createQuoteV2(payload);
                      try { setQuote(res.data as any); } catch {}
                      try { await ensureQuotesLoaded?.([Number(res.data.id)] as any); } catch {}
                      setShowQuoteModal(false);
                    } catch (e) {
                      console.error('Create quote failed', e);
                    }
                  }}
                  artistId={Number((bookingRequest as any).service_provider_id || (bookingRequest as any).artist_id || 0)}
                  clientId={Number((bookingRequest as any).client_id || 0)}
                  bookingRequestId={Number(bookingRequestId || 0)}
                  serviceName={bookingRequest?.service?.title}
                  initialBaseFee={bookingRequest?.service?.price ? Number(bookingRequest.service.price) : undefined}
                  initialTravelCost={bookingRequest && bookingRequest.travel_cost != null ? Number(bookingRequest.travel_cost) : undefined}
                  initialSoundNeeded={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Details modal */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-[85]">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetailsModal(false)} aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4 sm:pt-[calc(var(--app-header-height,64px)+8px)] sm:items-start">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="details-modal-title"
              className="relative z-[86] w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
            >
              <div id="details-modal-title" className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
                <div className="font-semibold">Request Details</div>
                <button
                  type="button"
                  className="rounded-full p-2 hover:bg-gray-100"
                  onClick={() => setShowDetailsModal(false)}
                  aria-label="Close"
                >
                  <span className="block h-5 w-5 text-gray-600">×</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm leading-6">
                {parsedDetails ? (
                  <dl className="grid gap-2">
                    {parsedDetails.eventType && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Event Type</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.eventType}</dd>
                      </div>
                    )}
                    {parsedDetails.date && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Date</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.date}</dd>
                      </div>
                    )}
                    {parsedDetails.location && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Location</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.location}</dd>
                      </div>
                    )}
                    {parsedDetails.guests && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Guests</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.guests}</dd>
                      </div>
                    )}
                    {parsedDetails.venueType && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Venue</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.venueType}</dd>
                      </div>
                    )}
                    {parsedDetails.soundNeeded && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Sound</dt>
                        <dd className="flex-1 text-gray-900">{parsedDetails.soundNeeded}</dd>
                      </div>
                    )}
                    {parsedDetails.description && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Description</dt>
                        <dd className="flex-1 text-gray-900 whitespace-pre-wrap">{parsedDetails.description}</dd>
                      </div>
                    )}
                    {parsedDetails.notes && (
                      <div className="flex items-start gap-2">
                        <dt className="w-28 text-gray-600">Notes</dt>
                        <dd className="flex-1 text-gray-900 whitespace-pre-wrap">{parsedDetails.notes}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <div className="text-gray-600">No details found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Always mount payment modal at root */}
      {paymentModal}
    </div>
  );
}
