'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Booking, BookingRequest } from '@/types';
import MessageThread from '../booking/MessageThread';
import BookingDetailsPanel from './BookingDetailsPanel';
import Spinner from '../ui/Spinner';
import AlertBanner from '../ui/AlertBanner';
import usePaymentModal from '@/hooks/usePaymentModal';
import * as api from '@/lib/api';
import { formatCurrency, formatDepositReminder } from '@/lib/utils';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'; // Importing an icon for "Show Details" button

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
  showReviewModal: boolean;
  setShowReviewModal: (show: boolean) => void;
}

export default function MessageThreadWrapper({
  bookingRequestId,
  bookingRequest,
  showReviewModal,
  setShowReviewModal,
}: MessageThreadWrapperProps) {
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState<Booking | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [parsedDetails, setParsedDetails] = useState<ParsedBookingDetails | null>(null);

  // Default to false. This controls if the RIGHTMOST panel is open.
  const [showSidePanel, setShowSidePanel] = useState(false);

  const sidePanelWidthDesktop = showSidePanel ? 'md:w-[300px]' : 'md:w-0';
  const sidePanelWidthLgDesktop = showSidePanel ? 'lg:w-[360px]' : 'lg:w-0';

  const { openPaymentModal, paymentModal } = usePaymentModal(
    useCallback(({ status, amount, receiptUrl: url }) => {
      setPaymentStatus(status);
      setPaymentAmount(amount);
      setReceiptUrl(url ?? null);
    }, []),
    useCallback(() => {}, [])
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
    } catch (err: any) {
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
    // Root container of MessageThreadWrapper: flex-col to stack banners on top of main content area
    <div className="flex flex-col h-full bg-white relative"> {/* Keep relative for potential absolute button */}
      {/* Booking Confirmation & Actions Banner */}
      {bookingConfirmed && confirmedBookingDetails && (
        <AlertBanner variant="success" className="mx-4 mt-4 rounded-lg">
          🎉 Booking confirmed for {bookingRequest.artist?.first_name || 'Artist'}!{' '}
          {confirmedBookingDetails.service?.title} on{' '}
          {new Date(confirmedBookingDetails.start_time).toLocaleString()}.{' '}
          {formatDepositReminder(confirmedBookingDetails.deposit_amount ?? 0, confirmedBookingDetails.deposit_due_by ?? undefined)}.
          <div className="flex flex-wrap gap-3 mt-2">
            <Link
              href={`/dashboard/client/bookings/${confirmedBookingDetails.id}`}
              className="inline-block text-indigo-600 hover:underline text-sm font-medium"
            >
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
            <button
              type="button"
              onClick={handleDownloadCalendar}
              className="inline-block text-indigo-600 underline text-sm font-medium"
            >
              Add to calendar
            </button>
          </div>
        </AlertBanner>
      )}

      {/* Payment Status Banner */}
      {paymentStatus && (
        <AlertBanner variant="info" className="mx-4 mt-2 rounded-lg">
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

      {/* Main Content Area: Chat and Booking Details Side Panel */}
      {/* This container needs to manage the horizontal flex behavior */}
      <div className="flex flex-1 min-h-0 py-4"> {/* flex-1 ensures it takes remaining vertical space */}
        {/* Chat Messages */}
        {/* Chat should take full width on mobile, and reduce width on desktop when panel is open */}
        <div
          className={`flex-1 min-w-0 px-4 sm:px-6 transition-[margin-right] duration-300 ease-in-out ${showSidePanel ? 'md:mr-[300px] lg:mr-[360px]' : ''}`}
        >
          <MessageThread
            bookingRequestId={bookingRequestId}
            serviceId={bookingRequest.service_id ?? undefined}
            clientName={bookingRequest.client?.first_name}
            artistName={bookingRequest.artist?.first_name}
            artistAvatarUrl={bookingRequest.artist?.profile_picture_url ?? null}
            serviceName={bookingRequest.service?.title}
            initialNotes={bookingRequest.message ?? null}
            initialBaseFee={bookingRequest.service?.price ? Number(bookingRequest.service.price) : undefined}
            initialTravelCost={bookingRequest.travel_cost !== null && bookingRequest.travel_cost !== undefined ? Number(bookingRequest.travel_cost) : undefined}
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
          />
        </div>

        {/* Side Panel Toggle Button (placed at top-right of the whole wrapper or chat header for Airbnb style) */}
        {/* Position this button to float over the content */}
        <button
          type="button"
          onClick={() => setShowSidePanel(s => !s)}
          aria-expanded={showSidePanel}
          aria-controls="reservation-panel"
          className="absolute top-4 right-4 md:top-6 md:right-6 z-20 p-2 rounded-full bg-white shadow-md text-gray-600 hover:bg-gray-100 transition-colors"
        >
          {showSidePanel ? 'Hide Details' : 'Show Details'}
        </button>


        {/* Booking Details Side Panel */}
        <section
          id="reservation-panel"
          role="complementary"
          className={`
            fixed inset-y-0 right-0 z-10
            w-full ${sidePanelWidthDesktop} ${sidePanelWidthLgDesktop}
            bg-white border-l border-gray-200 p-4
            transform transition-transform duration-300 ease-in-out
            ${showSidePanel ? 'translate-x-0' : 'translate-x-full'}
            shadow-lg
          `}
        >
          {/* Close button for side panel (visible on mobile where it overlays) */}
          <div className="flex justify-end mb-2 md:hidden">
            <button
              type="button"
              onClick={() => setShowSidePanel(false)}
              className="p-1 rounded-full hover:bg-gray-100 text-gray-600"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <BookingDetailsPanel
            bookingRequest={bookingRequest}
            parsedBookingDetails={parsedDetails}
            artistName={bookingRequest.artist?.first_name || 'Artist'}
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