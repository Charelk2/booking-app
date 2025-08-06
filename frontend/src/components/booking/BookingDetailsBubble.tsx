import React from 'react';
import clsx from 'clsx';
import type { ParsedBookingDetails } from '@/lib/bookingDetails';

interface BookingDetailsBubbleProps {
  details: ParsedBookingDetails;
  className?: string;
}

export default function BookingDetailsBubble({ details, className }: BookingDetailsBubbleProps) {
  return (
    <div
      className={clsx(
        'bg-gray-100 rounded-xl p-4 max-w-xs sm:max-w-md text-xs shadow-sm',
        className,
      )}
    >
      <h4 className="text-sm font-semibold mb-1">Booking Details</h4>
      <ul className="space-y-0.5">
        {details.eventType && (
          <li>
            <span className="font-medium">Event Type:</span> {details.eventType}
          </li>
        )}
        {details.description && (
          <li>
            <span className="font-medium">Description:</span> {details.description}
          </li>
        )}
        {details.date && (
          <li>
            <span className="font-medium">Date:</span> {details.date}
          </li>
        )}
        {details.location && (
          <li>
            <span className="font-medium">Location:</span> {details.location}
          </li>
        )}
        {details.guests && (
          <li>
            <span className="font-medium">Guests:</span> {details.guests}
          </li>
        )}
        {details.venueType && (
          <li>
            <span className="font-medium">Venue:</span> {details.venueType}
          </li>
        )}
        {details.soundNeeded && (
          <li>
            <span className="font-medium">Sound:</span> {details.soundNeeded}
          </li>
        )}
        {details.notes && (
          <li>
            <span className="font-medium">Notes:</span> {details.notes}
          </li>
        )}
      </ul>
    </div>
  );
}
