'use client';

import { useState, useCallback } from 'react';
import { Booking, BookingRequest } from '@/types';
import MessageThread from '../booking/MessageThread';
import BookingDetailsPanel from './BookingDetailsPanel';
import Spinner from '../ui/Spinner';
import usePaymentModal from '@/hooks/usePaymentModal';
import { downloadBookingIcs } from '@/lib/api';

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
}

export default function MessageThreadWrapper({
  bookingRequestId,
  bookingRequest,
}: MessageThreadWrapperProps) {
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [confirmedBookingDetails, setConfirmedBookingDetails] = useState<Booking | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
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
    const bookingId = confirmedBookingDetails?.id;
    if (!bookingId) return;
    try {
      const res = await downloadBookingIcs(bookingId);
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `booking-${bookingId}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
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
    <div className="flex flex-col h-full">
      <MessageThread
        bookingRequestId={bookingRequestId}
        serviceId={bookingRequest.service_id ?? undefined}
        clientName={bookingRequest.client?.first_name}
        artistName={bookingRequest.artist?.first_name}
        artistAvatarUrl={bookingRequest.artist?.profile_picture_url ?? null}
        serviceName={bookingRequest.service?.title}
        initialNotes={bookingRequest.message ?? null}
        initialBaseFee={bookingRequest.service?.price ? Number(bookingRequest.service.price) : undefined}
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
        onShowReviewModal={(show) => setShowReviewModal(show)}
      />
      <BookingDetailsPanel
        bookingRequest={bookingRequest}
        parsedBookingDetails={parsedDetails}
        artistName={bookingRequest.artist?.first_name || 'Artist'}
        artistAvatarUrl={bookingRequest.artist?.profile_picture_url ?? null}
        bookingConfirmed={bookingConfirmed}
        confirmedBookingDetails={confirmedBookingDetails}
        paymentStatus={paymentStatus}
        paymentAmount={paymentAmount}
        receiptUrl={receiptUrl}
        openPaymentModal={openPaymentModal}
        handleDownloadCalendar={handleDownloadCalendar}
        setShowReviewModal={setShowReviewModal}
        paymentModal={paymentModal}
      />
    </div>
  );
}
