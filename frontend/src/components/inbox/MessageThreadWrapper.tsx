'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SafeImage from '@/components/ui/SafeImage';

import { Booking, BookingRequest, QuoteV2 } from '@/types';
import * as api from '@/lib/api';
import { getFullImageUrl } from '@/lib/utils';

import MessageThread from '../booking/MessageThread';
import BookingDetailsPanel from './BookingDetailsPanel';
import usePaymentModal from '@/hooks/usePaymentModal';

import { XMarkIcon } from '@heroicons/react/24/outline';

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
}

export default function MessageThreadWrapper({
  bookingRequestId,
  bookingRequest,
  setShowReviewModal,
}: MessageThreadWrapperProps) {
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState<Booking | null>(null);

  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  const [parsedDetails, setParsedDetails] = useState<ParsedBookingDetails | null>(null);

  const [isUserArtist, setIsUserArtist] = useState(false);
  const { user } = api.useAuth();
  const router = useRouter();

  useEffect(() => {
    setIsUserArtist(Boolean(user && user.user_type === 'service_provider'));
  }, [user]);

  /** Mobile details sheet visibility */
  const [showSidePanel, setShowSidePanel] = useState(false);

  /** Payment modal */
  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status ?? null);
      setPaymentAmount(amount ?? null);
      setReceiptUrl(url ?? null);
    }, []),
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

  /** Lock background scroll on mobile while the sheet is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (showSidePanel) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = prev || '';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [showSidePanel]);

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

  // Detect if the visible preview is a Booka moderation system message
  const isBookaModeration = (() => {
    const text = (bookingRequest?.last_message_content || '').toString();
    const synthetic = Boolean((bookingRequest as any)?.is_booka_synthetic);
    return synthetic || /^\s*listing\s+(approved|rejected)\s*:/i.test(text);
  })();

  return (
    <div className="flex flex-col h-full w-full bg-white shadow-xl border-l border-gray-100 relative">
      {/* Unified header */}
      <header className="sticky top-0 z-10 bg-white text-gray-900 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between border-b border-gray-200 md:min-h-[64px]">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          {bookingRequest ? (
            isBookaModeration ? (
              <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center text-base font-medium">
                B
              </div>
            ) : isUserArtist ? (
              bookingRequest.client?.profile_picture_url ? (
                <SafeImage
                  src={bookingRequest.client.profile_picture_url}
                  alt="Client avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center text-base font-medium text-white">
                  {bookingRequest.client?.first_name?.charAt(0) || 'U'}
                </div>
              )
            ) : bookingRequest.artist_profile?.profile_picture_url ? (
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
                  src={bookingRequest.artist_profile.profile_picture_url}
                  alt="Service Provider avatar"
                  width={40}
                  height={40}
                  loading="lazy"
                  className="h-10 w-10 rounded-full object-cover"
                  sizes="40px"
                />
              </Link>
            ) : (
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base font-medium text-gray-600">
                {(bookingRequest.artist_profile?.business_name ||
                  bookingRequest.artist?.first_name ||
                  'U').charAt(0)}
              </div>
            )
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200" aria-hidden="true" />
          )}

          {/* Name */}
          <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
            {bookingRequest
              ? isBookaModeration
                ? 'Booka'
                : (isUserArtist
                    ? bookingRequest.client?.first_name || 'User'
                    : bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name || 'User')
              : 'Messages'}
          </span>
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

      {/* Alerts removed: system messages handle status updates; no deposits */}

      {/* Content */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row relative w-full">
        <div
          data-testid="thread-container"
          className={`flex-1 min-w-0 min-h-0 w-full transition-[width] duration-300 ease-in-out ${
            showSidePanel
              ? 'md:w-[calc(100%-300px)] lg:w-[calc(100%-360px)]'
              : 'md:w-full'
          }`}
        >
          <MessageThread
            bookingRequestId={bookingRequestId}
            serviceId={bookingRequest?.service_id ?? undefined}
            clientName={bookingRequest?.client?.first_name}
            artistName={bookingRequest?.artist_profile?.business_name || bookingRequest?.artist?.first_name}
            artistAvatarUrl={bookingRequest?.artist_profile?.profile_picture_url ?? null}
            clientAvatarUrl={bookingRequest?.client?.profile_picture_url ?? null}
            serviceName={bookingRequest?.service?.title}
            initialNotes={bookingRequest?.message ?? null}
            artistCancellationPolicy={bookingRequest?.artist_profile?.cancellation_policy ?? null}
            initialBaseFee={bookingRequest?.service?.price ? Number(bookingRequest.service.price) : undefined}
            initialTravelCost={bookingRequest && bookingRequest.travel_cost !== null && bookingRequest.travel_cost !== undefined ? Number(bookingRequest.travel_cost) : undefined}
            initialSoundNeeded={parsedDetails?.soundNeeded?.toLowerCase() === 'yes'}
            onBookingDetailsParsed={setParsedDetails}
            onBookingConfirmedChange={(confirmed, booking) => {
              setBookingConfirmed(confirmed);
              setConfirmedBookingDetails(booking);
            }}
            onPaymentStatusChange={(status, amount, url) => {
              setPaymentStatus(status);
              setPaymentAmount(amount);
              setReceiptUrl(url);
            }}
            onShowReviewModal={setShowReviewModal}
            onOpenDetailsPanel={() => setShowSidePanel(true)}
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
          {bookingRequest && (
            <BookingDetailsPanel
              bookingRequest={bookingRequest}
              parsedBookingDetails={parsedDetails}
              bookingConfirmed={bookingConfirmed}
              confirmedBookingDetails={confirmedBookingDetails}
              setShowReviewModal={setShowReviewModal}
              paymentModal={paymentModal}
              /** keep types happy; MessageThread owns actual quotes */
              quotes={{} as Record<number, QuoteV2>}
              openPaymentModal={(args: { bookingRequestId: number; amount: number }) =>
                openPaymentModal({ bookingRequestId: args.bookingRequestId, amount: args.amount } as any)
              }
            />
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
            {bookingRequest && (
              <BookingDetailsPanel
                bookingRequest={bookingRequest}
                parsedBookingDetails={parsedDetails}
                bookingConfirmed={bookingConfirmed}
                confirmedBookingDetails={confirmedBookingDetails}
                setShowReviewModal={setShowReviewModal}
                paymentModal={paymentModal}
                quotes={{} as Record<number, QuoteV2>}
                openPaymentModal={(args: { bookingRequestId: number; amount: number }) =>
                  openPaymentModal({ bookingRequestId: args.bookingRequestId, amount: args.amount } as any)
                }
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
