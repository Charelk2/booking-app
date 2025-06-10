'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format, parseISO, isValid } from 'date-fns';

export default function SummarySidebar() {
  const { details } = useBooking();
  const dateValue =
    typeof details.date === 'string' ? parseISO(details.date) : details.date;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Summary</h2>
      <div className="bg-gray-100 p-4 rounded-md space-y-2 text-sm">
        {details.date && isValid(dateValue) && (
          <p>
            <strong>Date:</strong> {format(dateValue, 'PP')}
            {details.time && ` ${details.time}`}
          </p>
        )}
        {details.location && (
          <p>
            <strong>Location:</strong> {details.location}
          </p>
        )}
        {details.guests && (
          <p>
            <strong>Guests:</strong> {details.guests}
          </p>
        )}
        {details.venueType && (
          <p>
            <strong>Venue:</strong> {details.venueType}
          </p>
        )}
        {details.notes && (
          <p>
            <strong>Notes:</strong> {details.notes}
          </p>
        )}
      </div>
    </div>
  );
}
