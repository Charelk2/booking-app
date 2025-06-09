'use client';
// Final review step with a sticky header and collapsible details so the submit
// button stays visible on mobile.
import { useBooking } from '@/contexts/BookingContext';
import { format } from 'date-fns';

export default function ReviewStep() {
  const { details } = useBooking();
  return (
    <div className="space-y-2">
      <div className="sticky top-16 bg-white z-20 py-2">
        <h3 className="text-lg font-medium">Review Details</h3>
      </div>
      <details open className="space-y-1">
        <summary className="cursor-pointer text-sm underline">Show details</summary>
        <ul className="text-sm space-y-1 mt-1">
        {details.date && (
          <li>
            <strong>Date:</strong> {format(details.date, 'PP')}
            {details.time && ` ${details.time}`}
          </li>
        )}
        {details.location && (
          <li>
            <strong>Location:</strong> {details.location}
          </li>
        )}
        {details.guests && (
          <li>
            <strong>Guests:</strong> {details.guests}
          </li>
        )}
        {details.venueType && (
          <li>
            <strong>Venue:</strong> {details.venueType}
          </li>
        )}
        {details.notes && (
          <li>
            <strong>Notes:</strong> {details.notes}
          </li>
        )}
        </ul>
      </details>
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
