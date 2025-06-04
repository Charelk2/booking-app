'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format } from 'date-fns';

export default function SummarySidebar() {
  const { details } = useBooking();
  return (
    <div className="p-4 bg-white shadow rounded space-y-2">
      <h2 className="text-lg font-medium">Summary</h2>
      <ul className="text-sm space-y-1">
        {details.date && (
          <li>
            <strong>Date:</strong> {format(details.date, 'PP')} {details.time}
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
