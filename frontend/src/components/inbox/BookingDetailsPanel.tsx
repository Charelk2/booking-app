'use client';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';

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
  bookingConfirmed: boolean;
  confirmedBookingDetails: Booking | null;
  setShowReviewModal: (show: boolean) => void;
  paymentModal: React.ReactNode;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
}: BookingDetailsPanelProps) {
  const { user } = useAuth();
  const isUserArtist = user?.user_type === 'service_provider';

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
    <div className="w-full bg-brand/10 dark:bg-brand-dark/30 rounded-xl p-4 text-xs flex flex-col h-full">
      <h4 className="mb-2 text-sm font-semibold">Booking Details</h4>
      <ul className="flex-1 overflow-y-auto space-y-1">
        <li>
          <span className="font-medium">{isUserArtist ? 'Client' : 'Artist'}:</span>{' '}
          {isUserArtist
            ? bookingRequest.client
              ? `${bookingRequest.client.first_name} ${bookingRequest.client.last_name}`
              : 'N/A'
            : bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name || 'N/A'}
        </li>
        <li>
          <span className="font-medium">Email:</span>{' '}
          {isUserArtist
            ? bookingRequest.client?.email || 'N/A'
            : bookingRequest.artist?.email || 'N/A'}
        </li>
        <li>
          <span className="font-medium">Service:</span> {bookingRequest.service?.title || 'N/A'}
        </li>
        {parsedBookingDetails?.eventType && (
          <li>
            <span className="font-medium">Event Type:</span> {parsedBookingDetails.eventType}
          </li>
        )}
        {displayProposedDateTime && isValid(displayProposedDateTime) && (
          <li>
            <span className="font-medium">Date &amp; Time:</span>{' '}
            {format(displayProposedDateTime, 'PPP')} {format(displayProposedDateTime, 'p')}
          </li>
        )}
        {parsedBookingDetails?.location && (
          <li>
            <span className="font-medium">Location:</span> {cleanLocation(parsedBookingDetails.location)}
          </li>
        )}
        {parsedBookingDetails?.description && (
          <li>
            <span className="font-medium">Description:</span> {parsedBookingDetails.description}
          </li>
        )}
        {parsedBookingDetails?.guests && (
          <li>
            <span className="font-medium">Guests:</span> {parsedBookingDetails.guests}
          </li>
        )}
        {parsedBookingDetails?.venueType && (
          <li>
            <span className="font-medium">Venue Type:</span> {parsedBookingDetails.venueType}
          </li>
        )}
        {parsedBookingDetails?.soundNeeded && (
          <li>
            <span className="font-medium">Sound Needed:</span> {parsedBookingDetails.soundNeeded === 'Yes' ? 'Yes' : 'No'}
          </li>
        )}
        {parsedBookingDetails?.notes && (
          <li>
            <span className="font-medium">Notes:</span> {parsedBookingDetails.notes}
          </li>
        )}
      </ul>
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
      {paymentModal}
    </div>
  );
}