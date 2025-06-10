'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format, parseISO, isValid } from 'date-fns';

export default function SummarySidebar() {
  const { details } = useBooking();
  const dateValue =
    typeof details.date === 'string' ? parseISO(details.date) : details.date;
  return (
    <div className="p-4 bg-white shadow rounded space-y-2">
      <h2 className="text-lg font-medium">Summary</h2>
      <ul className="text-sm space-y-1">
        {details.date && isValid(dateValue) && (
          <li>
            <strong>Date:</strong> {format(dateValue, 'PP')}
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
    </div>
  );
}
