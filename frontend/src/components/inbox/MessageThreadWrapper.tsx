'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Booking, BookingRequest } from '@/types';
import MessageThread from '../booking/MessageThread';
import BookingDetailsPanel from './BookingDetailsPanel';
import Spinner from '../ui/Spinner';
import AlertBanner from '../ui/AlertBanner';
import usePaymentModal from '@/hooks/usePaymentModal';
import * as api from '@/lib/api';
import { formatCurrency, formatDepositReminder, getFullImageUrl } from '@/lib/utils';
import { InformationCircleIcon, BanknotesIcon } from '@heroicons/react/24/outline';
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

  useEffect(() => {
    if (user && user.user_type === 'artist') {
      setIsUserArtist(true);
    } else {
      setIsUserArtist(false);
    }
  }, [user]);

  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  useEffect(() => {
    const handleInitialPanelState = () => {
      setShowSidePanel(window.innerWidth >= 768);
    };
    handleInitialPanelState();
    window.addEventListener('resize', handleInitialPanelState);
    return () => window.removeEventListener('resize', handleInitialPanelState);
  }, []);

  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status);
      setPaymentAmount(amount);
      setReceiptUrl(url ?? null);
    }, []),
    useCallback(() => {}, []),
  );

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

  if (!bookingRequest) {
    return (
      <div className="flex justify-center py-6 h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white shadow-xl border border-gray-100 relative">
      {/* Unified Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-red-600 to-indigo-700 text-white px-4 py-2 flex items-center  md:min-h-[64px]">
        <div className="flex items-center transition-all duration-300 ease-in-out">
          {/* Avatar on left */}
          {isUserArtist ? (
            bookingRequest.client?.profile_picture_url ? (
              <Image
                src={getFullImageUrl(bookingRequest.client.profile_picture_url) as string}
                alt="Client avatar"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-red-400 flex items-center justify-center text-base font-medium border-2 border-white shadow-sm flex-shrink-0">
                {bookingRequest.client?.first_name?.charAt(0) || 'U'}
              </div>
            )
          ) : bookingRequest.artist?.profile_picture_url ? (
            <Link
              href={`/artists/${bookingRequest.artist.id}`}
              aria-label="Artist profile"
              className="flex-shrink-0"
            >
              <Image
                src={getFullImageUrl(bookingRequest.artist.profile_picture_url) as string}
                alt="Artist avatar"
                width={40}
                height={40}
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    getFullImageUrl('/static/default-avatar.svg') as string;
                }}
              />
            </Link>
          ) : (
            <div className="h-10 w-10 rounded-full bg-red-400 flex items-center justify-center text-base font-medium border-2 border-white shadow-sm flex-shrink-0">
              {(bookingRequest.artist?.business_name || bookingRequest.artist?.user?.first_name || 'U').charAt(0)}
            </div>
          )}

          {/* Name next to avatar */}
          <span className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis ml-2">
            Chat with {
              isUserArtist
                ? bookingRequest.client?.first_name || 'User'
                : bookingRequest.artist?.business_name ||
                  bookingRequest.artist?.user?.first_name ||
                  'User'
            }
          </span>

          {/* Send Quote button next */}
          {isUserArtist && !bookingConfirmed && (
            <button
              type="button"
              onClick={() => setShowQuoteModal(true)}
              aria-label="Send Quote"
              className="ml-2 p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <BanknotesIcon className="h-6 w-6 text-white" aria-hidden="true" />
            </button>
          )}

          {/* Separator for desktop when panel is visible */}
        </div>

        {showSidePanel && (
          <div className="hidden md:block border-l border-white/20 h-8 mx-4 flex-shrink-0"></div>
        )}

        {/* Reservation Header Right Section (Desktop) */}
        {showSidePanel && (
          <div className="hidden md:flex items-center flex-auto justify-between transition-opacity duration-300 ease-in-out">
            <h2 className="font-semibold text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis">
              Reservation
            </h2>
            <button
              type="button"
              onClick={() => setShowSidePanel(false)}
              aria-label="Hide details panel"
              className="p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center space-x-1 text-sm font-medium"
            >
              Hide Details <InformationCircleIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Show Details button for desktop (when panel is hidden) */}
        {!showSidePanel && (
          <button
            type="button"
            onClick={() => setShowSidePanel(true)}
            aria-label="Show booking details"
            className="ml-auto p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center space-x-1 text-sm font-medium hidden md:flex"
          >
            Show Details <InformationCircleIcon className="h-5 w-5" />
          </button>
        )}

        {/* Mobile View/Hide Details Button */}
        <button
          type="button"
          onClick={() => setShowSidePanel((s) => !s)}
          aria-label={showSidePanel ? 'Hide details' : 'Show details'}
          className="ml-auto p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center space-x-1 text-sm font-medium md:hidden"
        >
          {showSidePanel ? (
            <>Hide Details <InformationCircleIcon className="h-5 w-5" /></>
          ) : (
            <>Show Details <InformationCircleIcon className="h-5 w-5" /></>
          )}
        </button>
      </header>

      {/* Alert Banners */}
      {bookingConfirmed && confirmedBookingDetails && (
        <AlertBanner variant="success" className="mx-4 mt-4 rounded-lg z-10">
          🎉 Booking confirmed for {bookingRequest.artist?.business_name || bookingRequest.artist?.user?.first_name || 'Artist'}! {confirmedBookingDetails.service?.title} on {new Date(confirmedBookingDetails.start_time).toLocaleString()}. {formatDepositReminder(confirmedBookingDetails.deposit_amount ?? 0, confirmedBookingDetails.deposit_due_by ?? undefined)}.
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
      <div className="flex flex-1 min-h-0 flex-col md:flex-row relative">
        <div className={`flex-1 min-w-0 p-4 transition-[width] duration-300 ease-in-out ${
          showSidePanel ? 'md:w-[calc(100%-300px)] lg:w-[calc(100%-360px)]' : 'md:w-full'
        }`}>         
          <MessageThread
            bookingRequestId={bookingRequestId}
            serviceId={bookingRequest.service_id ?? undefined}
            clientName={bookingRequest.client?.first_name}
            artistName={bookingRequest.artist?.business_name || bookingRequest.artist?.user?.first_name}
            artistAvatarUrl={bookingRequest.artist?.profile_picture_url ?? null}
            clientAvatarUrl={bookingRequest.client?.profile_picture_url ?? null}
            serviceName={bookingRequest.service?.title}
            initialNotes={bookingRequest.message ?? null}
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
            showQuoteModal={showQuoteModal}
            setShowQuoteModal={setShowQuoteModal}
          />
        </div>

        <section
          id="reservation-panel-desktop"
          role="complementary"
          className={`hidden md:flex flex-col border-l border-gray-200 transform transition-all duration-300 ease-in-out flex-shrink-0 md:static md:translate-x-0 md:overflow-y-auto ${
            showSidePanel ? 'md:w-[300px] lg:w-[360px] md:p-4' : 'md:w-0 md:p-0 md:overflow-hidden'
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

        <section
          id="reservation-panel-mobile"
          role="complementary"
          className={`md:hidden fixed inset-y-0 right-0 z-10 w-full bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${
            showSidePanel ? 'translate-x-0' : 'translate-x-full'
          } p-4`}
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
      </div>
    </div>
  );
}
