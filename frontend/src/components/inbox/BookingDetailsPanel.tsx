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
  const isUserArtist = user?.user_type === 'artist';

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
    // Added bg-white and shadow-sm directly to this component's root div
    <div className="bg-white shadow-sm flex flex-col h-full rounded-2xl overflow-hidden">
      <dl className="flex-1 overflow-y-auto space-y-2 text-sm text-gray-800 p-4">
            <div className="flex justify-between">
              <dt className="font-medium">{isUserArtist ? 'Client' : 'Artist'}</dt>
              <dd>
                {isUserArtist
                  ? bookingRequest.client
                    ? `${bookingRequest.client.first_name} ${bookingRequest.client.last_name}`
                    : 'N/A'
                  : bookingRequest.artist?.business_name || bookingRequest.artist?.user?.first_name || 'N/A'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="font-medium">Email</dt>
              <dd>
                {isUserArtist
                  ? bookingRequest.client?.email || 'N/A'
                  : bookingRequest.artist?.user?.email || 'N/A'}
              </dd>
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