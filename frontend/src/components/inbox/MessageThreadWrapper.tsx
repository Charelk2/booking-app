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
    return <p className="p-4">Select a conversation to view messages.</p>;
  }

  if (!bookingRequest) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {bookingConfirmed && confirmedBookingDetails && (
        <AlertBanner variant="success" className="mx-4 mt-4 rounded-lg">
          🎉 Booking confirmed for {bookingRequest.artist?.first_name || 'Artist'}!{' '}
          {confirmedBookingDetails.service?.title} on{' '}
          {new Date(confirmedBookingDetails.start_time).toLocaleString()}.{' '}
          {formatDepositReminder(
            confirmedBookingDetails.deposit_amount ?? undefined,
            confirmedBookingDetails.deposit_due_by ?? undefined,
          )}
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

      <div className="flex flex-1 min-h-0 md:flex-row py-4">
        <div className="flex-1 md:w-3/4 min-w-0 px-4 sm:px-6">
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

        <div className="w-full md:w-1/4 min-w-[280px] md:border-l border-gray-200 px-4 pt-4 md:pt-0 flex-shrink-0">
          <BookingDetailsPanel
            bookingRequest={bookingRequest}
            parsedBookingDetails={parsedDetails}
            artistName={bookingRequest.artist?.first_name || 'Artist'}
            bookingConfirmed={bookingConfirmed}
            confirmedBookingDetails={confirmedBookingDetails}
            setShowReviewModal={setShowReviewModal}
            paymentModal={paymentModal}
          />
        </div>
      </div>
    </div>
  );
}
