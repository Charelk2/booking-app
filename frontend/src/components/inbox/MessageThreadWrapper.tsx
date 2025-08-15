'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Booking, BookingRequest } from '@/types';
import MessageThread from '../booking/MessageThread';
import BookingDetailsPanel from './BookingDetailsPanel';
import Spinner from '../ui/Spinner';
import AlertBanner from '../ui/AlertBanner';
import usePaymentModal from '@/hooks/usePaymentModal';
import * as api from '@/lib/api';
import { formatCurrency, formatDepositReminder, getFullImageUrl } from '@/lib/utils';
import { InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';

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
    if (user && user.user_type === 'service_provider') {
      setIsUserArtist(true);
    } else {
      setIsUserArtist(false);
    }
  }, [user]);

  const [showSidePanel, setShowSidePanel] = useState(false);

  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status);
      setPaymentAmount(amount);
      setReceiptUrl(url ?? null);
    }, []),
    useCallback(() => {}, []),
  );

  // Close mobile sheet on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSidePanel(false);
    };
    if (showSidePanel) {
      window.addEventListener('keydown', onKeyDown);
    }
    return () => window.removeEventListener('keydown', onKeyDown);
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
  // Close the details panel before navigating away on mobile.
  // When the panel is open, we push a history state so pressing the back
  // button closes the panel instead of leaving the message thread.
  useEffect(() => {
    const handlePopState = () => {
      if (showSidePanel) {
        setShowSidePanel(false);
      } else {
        router.back();
      }
    };

    window.addEventListener('popstate', handlePopState);
    if (showSidePanel) {
      window.history.pushState(null, '');
    }
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showSidePanel, router]);

  if (!bookingRequestId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
        <p>Select a conversation to view messages.</p>
      </div>
    );
  }

  if (!bookingRequest) {
    return (
      <div className="flex justify-center py-6 h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white shadow-xl border-l border-gray-100 relative">
      {/* Unified Header */}
      <header className="sticky top-0 z-10 bg-white text-gray-900 px-3 py-2 sm:px-5 sm:py-3 flex items-center justify-between border-b border-gray-200 md:min-h-[64px]">
        <div className="flex items-center gap-3">
          {/* Avatar on left */}
          {isUserArtist ? (
            bookingRequest.client?.profile_picture_url ? (
              <Image
                src={getFullImageUrl(bookingRequest.client.profile_picture_url) as string}
                alt="Client avatar"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-black flex items-center justify-center text-base font-medium text-white">
                {bookingRequest.client?.first_name?.charAt(0) || 'U'}
              </div>
            )
          ) : bookingRequest.artist_profile?.profile_picture_url ? (
            <Link
              href={`/service-providers/${bookingRequest.artist?.id}`}
              aria-label="Service Provider profile"
              className="flex-shrink-0"
            >
              <Image
                src={getFullImageUrl(bookingRequest.artist_profile.profile_picture_url) as string}
                alt="Service Provider avatar"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            </Link>
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-base font-medium text-gray-600">
              {(bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name || 'U').charAt(0)}
            </div>
          )}

          {/* Name next to avatar */}
          <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
            {
              isUserArtist
                ? bookingRequest.client?.first_name || 'User'
                : bookingRequest.artist_profile?.business_name ||
                  bookingRequest.artist?.first_name ||
                  'User'
            }
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 px-2 sm:px-4">
          <button
            type="button"
            onClick={() => setShowSidePanel((s) => !s)}
            aria-label={showSidePanel ? 'Hide details' : 'Show details'}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <InformationCircleIcon className="h-6 w-6 text-gray-600" />
          </button>
        </div>
      </header>

      {/* Alert Banners */}
      {bookingConfirmed && confirmedBookingDetails && (
        <AlertBanner variant="success" className="mx-4 mt-4 rounded-lg z-10">
          🎉 Booking confirmed for {bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name || 'Service Provider'}! {confirmedBookingDetails.service?.title} on {new Date(confirmedBookingDetails.start_time).toLocaleString()}. {formatDepositReminder(confirmedBookingDetails.deposit_amount ?? 0, confirmedBookingDetails.deposit_due_by ?? undefined)}.
          <div className="flex flex-wrap gap-3 mt-2">
            <Link href={`/dashboard/client/bookings/${confirmedBookingDetails.id}`} className="inline-block text-indigo-600 hover:underline text-sm font-medium">
              View booking
            </Link>
            <button
              type="button"
              onClick={() =>
                openPaymentModal({
                  bookingRequestId: bookingRequest.id,
                  depositAmount: confirmedBookingDetails.deposit_amount ?? undefined,
                  depositDueBy: confirmedBookingDetails.deposit_due_by ?? undefined,
                })
              }
              className="inline-block text-indigo-600 underline text-sm font-medium"
            >
              Pay deposit
            </button>
            <button type="button" onClick={handleDownloadCalendar} className="inline-block text-indigo-600 underline text-sm font-medium">
              Add to calendar
            </button>
          </div>
        </AlertBanner>
      )}

      {paymentStatus && (
        <AlertBanner variant="info" className="mx-4 mt-2 rounded-lg z-10">
          {paymentStatus === 'paid'
            ? 'Payment completed.'
            : `Deposit of ${formatCurrency(paymentAmount ?? 0)} received.`}{' '}
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noopener" className="ml-2 underline text-indigo-600">
              View receipt
            </a>
          )}
        </AlertBanner>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row relative w-full">
        <div
          data-testid="thread-container"
          className={`flex-1 min-w-0 min-h-0 w-full transition-[width] duration-300 ease-in-out] ${
            showSidePanel ? 'md:w-[calc(100%-300px)] lg:w-[calc(100%-360px)]' : 'md:w-full'
          }`}
        >
          <MessageThread
            bookingRequestId={bookingRequestId}
            serviceId={bookingRequest.service_id ?? undefined}
            clientName={bookingRequest.client?.first_name}
            artistName={bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name}
            artistAvatarUrl={bookingRequest.artist_profile?.profile_picture_url ?? null}
            clientAvatarUrl={bookingRequest.client?.profile_picture_url ?? null}
            serviceName={bookingRequest.service?.title}
            initialNotes={bookingRequest.message ?? null}
            artistCancellationPolicy={bookingRequest.artist_profile?.cancellation_policy ?? null}
            initialBaseFee={bookingRequest.service?.price ? Number(bookingRequest.service.price) : undefined}
            initialTravelCost={
              bookingRequest.travel_cost !== null && bookingRequest.travel_cost !== undefined
                ? Number(bookingRequest.travel_cost)
                : undefined
            }
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
          />
        </div>

        <section
          id="reservation-panel-desktop"
          role="complementary"
          className={`hidden md:flex flex-col bg-white text-sm leading-6 transform transition-all duration-300 ease-in-out flex-shrink-0 md:static md:translate-x-0 md:overflow-y-auto ${
            showSidePanel ? 'border-l border-gray-200 md:w-[300px] lg:w-[360px] md:p-5 lg:p-6' : 'md:w-0 md:p-0 md:overflow-hidden'
          }`}
        >
          <BookingDetailsPanel
            bookingRequest={bookingRequest}
            parsedBookingDetails={parsedDetails}
            bookingConfirmed={bookingConfirmed}
            confirmedBookingDetails={confirmedBookingDetails}
            setShowReviewModal={setShowReviewModal}
            paymentModal={paymentModal}
          />
        </section>

        {/* Mobile overlay backdrop */}
        {showSidePanel && (
          <div
            className="md:hidden fixed inset-0 z-30 bg-black/30"
            onClick={() => setShowSidePanel(false)}
            aria-hidden="true"
          />
        )}

        <section
          id="reservation-panel-mobile"
          role="complementary"
          aria-modal="true"
          className={`md:hidden fixed inset-x-0 bottom-0 z-40 w-full bg-white shadow-2xl transform transition-transform duration-300 ease-out rounded-t-2xl text-sm leading-6 ${
            showSidePanel ? 'translate-y-0' : 'translate-y-full'
          } max-h-[85vh] h-[85vh] overflow-y-auto`}
        >
          <div className="sticky top-0 z-10 bg-white rounded-t-2xl px-4 pt-3 pb-2 border-b border-gray-100 flex items-center justify-between">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
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
          <BookingDetailsPanel
            bookingRequest={bookingRequest}
            parsedBookingDetails={parsedDetails}
            bookingConfirmed={bookingConfirmed}
            confirmedBookingDetails={confirmedBookingDetails}
            setShowReviewModal={setShowReviewModal}
            paymentModal={paymentModal}
          />
          </div>
        </section>
      </div>
    </div>
  );
}
