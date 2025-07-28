'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format, parseISO, isValid } from 'date-fns';
import { motion } from 'framer-motion';

export default function SummarySidebar() {
  const { details } = useBooking();
  const dateValue =
    typeof details.date === 'string' ? parseISO(details.date) : details.date;
  return (
    <motion.div
      layout
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="space-y-4"
    >
      <h3 className="text-lg font-semibold mt-4 mb-2">Booking Summary</h3>
      <dl className="bg-gray-50 p-4 rounded-lg text-sm space-y-1">
        {details.date && isValid(dateValue) && (
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-800">Date</dt>
            <dd className="text-gray-600">
              {format(dateValue, 'PP')}
              {details.time && ` ${details.time}`}
            </dd>
          </div>
        )}
        {details.location && (
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-800">Location</dt>
            <dd className="text-gray-600">{details.location}</dd>
          </div>
        )}
        {details.guests && (
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-800">Guests</dt>
            <dd className="text-gray-600">{details.guests}</dd>
          </div>
        )}
        {details.venueType && (
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-800">Venue</dt>
            <dd className="text-gray-600">{details.venueType}</dd>
          </div>
        )}
        {details.notes && (
          <div className="flex justify-between">
            <dt className="font-semibold text-gray-800">Notes</dt>
            <dd className="text-gray-600">{details.notes}</dd>
          </div>
        )}
      </dl>
    </motion.div>
  );
}
