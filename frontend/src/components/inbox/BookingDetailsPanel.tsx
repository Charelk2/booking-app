'use client';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review } from '@/types';
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
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  artistName,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
}: BookingDetailsPanelProps) {

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
    <div className="bg-white rounded-2xl p-6 border-gray-200 shadow-sm sticky top-0">
      <h2 className="text-lg font-semibold border-b border-gray-200 pb-2 mb-3">Booking Details</h2>
      <dl className="space-y-2 text-sm text-gray-800">
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
              confirmedBookingDetails?.status === 'completed' &&
              !(confirmedBookingDetails as Booking & { review?: Review }).review && (
                <div className="mt-4 text-center">
                  <Button
                    type="button"
                    onClick={() => setShowReviewModal(true)}
                    className="text-indigo-700 underline hover:bg-indigo-50 hover:text-indigo-800 transition-colors"
                  >
                    Leave Review
                  </Button>
                </div>
              )}
      </dl>
      {paymentModal}
    </div>
  );
}
