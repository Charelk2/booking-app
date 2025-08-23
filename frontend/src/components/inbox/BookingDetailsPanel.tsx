'use client';

import React from 'react';

import { format, parseISO, isValid } from 'date-fns';
import { Booking, BookingRequest, Review, QuoteV2 } from '@/types';
import Button from '../ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import BookingSummaryCard from '../booking/BookingSummaryCard';
import { getEventPrep } from '@/lib/api';

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
  quotes: Record<number, QuoteV2>;
  openPaymentModal: (args: { bookingRequestId: number; amount: number }) => void;
}

export default function BookingDetailsPanel({
  bookingRequest,
  parsedBookingDetails,
  bookingConfirmed,
  confirmedBookingDetails,
  setShowReviewModal,
  paymentModal,
  quotes,
  openPaymentModal,
}: BookingDetailsPanelProps) {
  const { user } = useAuth();
  const [eventType, setEventType] = React.useState<string | null>(null);
  const [guestsCount, setGuestsCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    const bid = (confirmedBookingDetails as any)?.id;
    if (!bid) return;
    let cancelled = false;
    getEventPrep(bid)
      .then((ep) => {
        if (cancelled) return;
        const et = (ep as any)?.event_type || null;
        const gc = (ep as any)?.guests_count;
        setEventType(et ? String(et) : null);
        setGuestsCount(typeof gc === 'number' ? gc : (gc != null ? Number(gc) : null));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [confirmedBookingDetails?.id]);

  return (
    <div className="w-full flex flex-col h-full">
      <h4 className="mb-3 text-base font-semibold text-gray-900">Booking Details</h4>

      {/* Quick Event glance */}
      {(() => {
        const displayEventType = eventType || parsedBookingDetails?.eventType || null;
        const displayGuests = (guestsCount != null ? String(guestsCount) : (parsedBookingDetails?.guests || '')).toString().trim();
        if (!displayEventType && !displayGuests) return null;
        return (
          <div className="mb-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-sm font-semibold mb-1">Event</div>
            <ul className="text-sm leading-6">
              {displayEventType && (
                <li className="py-0.5"><span className="font-medium">Type:</span> {displayEventType}</li>
              )}
              {displayGuests && (
                <li className="py-0.5"><span className="font-medium">Guests:</span> {displayGuests}</li>
              )}
            </ul>
          </div>
        );
      })()}
      <BookingSummaryCard
        parsedBookingDetails={parsedBookingDetails ?? undefined}
        imageUrl={bookingRequest.service?.media_url}
        serviceName={bookingRequest.service?.title}
        artistName={bookingRequest.artist_profile?.business_name || bookingRequest.artist?.first_name}
        bookingConfirmed={bookingConfirmed}
        paymentInfo={{ status: null, amount: null, receiptUrl: null }}
        bookingDetails={confirmedBookingDetails}
        quotes={quotes}
        allowInstantBooking={false}
        openPaymentModal={openPaymentModal}
        bookingRequestId={bookingRequest.id}
        baseFee={Number(bookingRequest.service?.price || 0)}
        travelFee={Number(bookingRequest.travel_cost || 0)}
        initialSound={parsedBookingDetails?.soundNeeded === 'Yes'}
        artistCancellationPolicy={bookingRequest.artist_profile?.cancellation_policy}
        currentArtistId={bookingRequest.artist.id}
      />
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
