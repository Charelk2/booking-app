'use client';
// TODO: Implement a sticky summary header with collapsible line items and
// show success/failure toasts after submission.
import { useBooking } from '@/contexts/BookingContext';
import { format } from 'date-fns';

export default function ReviewStep() {
  const { details } = useBooking();
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">Review Details</h3>
      <ul className="text-sm space-y-1">
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
      <p className="text-gray-600 text-sm">
        Please confirm the information above before sending your request.
      </p>
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
