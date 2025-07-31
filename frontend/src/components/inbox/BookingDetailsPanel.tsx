'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import Link from 'next/link';
import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest } from '@/types';
import Button from '../ui/Button';

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

interface BookingDetailsPanelProps {
  bookingRequest: BookingRequest;
  parsedBookingDetails: ParsedBookingDetails | null;
  artistName: string;
  artistAvatarUrl: string | null;
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  paymentStatus: string | null;
  paymentAmount: number | null;
  receiptUrl: string | null;
  openPaymentModal: (opts: any) => void;
  handleDownloadCalendar: () => void;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  artistName,
  artistAvatarUrl,
  bookingConfirmed,
  confirmedBookingDetails,
  paymentStatus,
  paymentAmount,
  receiptUrl,
  openPaymentModal,
  handleDownloadCalendar,
  setShowReviewModal,
  paymentModal,
}: BookingDetailsPanelProps) {
  const [showFullDetails, setShowFullDetails] = useState(false);

  const cleanLocation = (locationString: string | undefined) => {
    if (!locationString) return 'N/A';
    let cleaned = locationString.replace(/,?\s*South Africa/gi, '');
    cleaned = cleaned.replace(/,\s*\d{4}\s*$/, '').trim();
    cleaned = cleaned.replace(/,$/, '').trim();
    return cleaned;
  };

  const displayProposedDateTime = parsedBookingDetails?.date
    ? parseISO(parsedBookingDetails.date)
    : bookingRequest.proposed_datetime_1
    ? parseISO(bookingRequest.proposed_datetime_1)
    : null;

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-4">
      {bookingConfirmed && confirmedBookingDetails && (
        <div>
          <p className="text-sm text-green-700" data-testid="booking-confirmed">
            🎉 Booking confirmed for {artistName} on{' '}
            {format(
              new Date(confirmedBookingDetails.start_time),
              'PPP p'
            )}
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            <Link
              href={`/dashboard/client/bookings/${confirmedBookingDetails.id}`}
              className="text-indigo-600 underline text-sm"
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
              className="text-indigo-600 underline text-sm"
            >
              Pay deposit
            </button>
            <button
              type="button"
              onClick={handleDownloadCalendar}
              className="text-indigo-600 underline text-sm"
            >
              Add to calendar
            </button>
          </div>
        </div>
      )}

      {paymentStatus && (
        <div className="text-sm text-blue-700" data-testid="payment-status">
          {paymentStatus === 'paid'
            ? 'Payment completed.'
            : `Deposit of R${paymentAmount ?? 0} received.`}{' '}
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noopener" className="underline">
              View receipt
            </a>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Booking Details</h2>
          <button
            type="button"
            onClick={() => setShowFullDetails((s) => !s)}
            className="text-sm text-indigo-600 underline"
          >
            {showFullDetails ? 'Hide Details' : 'Show More'}
          </button>
        </div>
        {showFullDetails && (
          <motion.dl
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            className="mt-2 space-y-2 text-sm"
          >
            <div className="flex justify-between">
              <dt className="font-medium">Client</dt>
              <dd>
                {bookingRequest.client
                  ? `${bookingRequest.client.first_name} ${bookingRequest.client.last_name}`
                  : 'N/A'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium">Email</dt>
              <dd>{bookingRequest.client?.email || 'N/A'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium">Service</dt>
              <dd>{bookingRequest.service?.title || 'N/A'}</dd>
            </div>
            {parsedBookingDetails?.eventType && (
              <div className="flex justify-between">
                <dt className="font-medium">Event Type</dt>
                <dd>{parsedBookingDetails.eventType}</dd>
              </div>
            )}
            {displayProposedDateTime && isValid(displayProposedDateTime) && (
              <div className="flex justify-between">
                <dt className="font-medium">Date & Time</dt>
                <dd>
                  {format(displayProposedDateTime, 'PPP')}{' '}
                  {format(displayProposedDateTime, 'p')}
                </dd>
              </div>
            )}
            {parsedBookingDetails?.location && (
              <div className="flex justify-between">
                <dt className="font-medium">Location</dt>
                <dd>{cleanLocation(parsedBookingDetails.location)}</dd>
              </div>
            )}
            {parsedBookingDetails?.description && (
              <div className="flex justify-between">
                <dt className="font-medium">Description</dt>
                <dd>{parsedBookingDetails.description}</dd>
              </div>
            )}
            {parsedBookingDetails?.guests && (
              <div className="flex justify-between">
                <dt className="font-medium">Guests</dt>
                <dd>{parsedBookingDetails.guests}</dd>
              </div>
            )}
            {parsedBookingDetails?.venueType && (
              <div className="flex justify-between">
                <dt className="font-medium">Venue Type</dt>
                <dd>{parsedBookingDetails.venueType}</dd>
              </div>
            )}
            {parsedBookingDetails?.soundNeeded && (
              <div className="flex justify-between">
                <dt className="font-medium">Sound Needed</dt>
                <dd>{parsedBookingDetails.soundNeeded === 'Yes' ? 'Yes' : 'No'}</dd>
              </div>
            )}
            {parsedBookingDetails?.notes && (
              <div className="flex justify-between">
                <dt className="font-medium">Notes</dt>
                <dd>{parsedBookingDetails.notes}</dd>
              </div>
            )}
            {bookingConfirmed &&
              confirmedBookingDetails?.status === 'completed' && (
                <Button
                  type="button"
                  onClick={() => setShowReviewModal(true)}
                  className="mt-2 text-indigo-700 underline"
                >
                  Leave Review
                </Button>
              )}
          </motion.dl>
        )}
      </div>
      {paymentModal}
    </div>
  );
}
