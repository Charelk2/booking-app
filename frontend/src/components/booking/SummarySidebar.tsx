'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format, parseISO, isValid } from 'date-fns';
import { motion } from 'framer-motion';
import React, { useState } from 'react';

export default function SummarySidebar() {
  const { details } = useBooking();
  const dateValue =
    typeof details.date === 'string' ? parseISO(details.date) : details.date;

  const [isVisible, setIsVisible] = useState(false);

  const cleanLocation = (locationString: string) => {
    if (!locationString) return '';
    let cleaned = locationString.replace(/,?\s*South Africa/gi, '');
    cleaned = cleaned.replace(/,\s*\d{4}\s*$/, '').trim();
    cleaned = cleaned.replace(/,$/, '').trim();
    return cleaned;
  };

  if (!isVisible) {
    return (
      <div className="flex justify-center w-full p-0">
        <button
          onClick={() => setIsVisible(true)}
          className="text-gray-400 hover:text-gray-800 font-medium py-2 text-sm flex items-center justify-center space-x-1 cursor-pointer"
        >
          <span className="text-xs">Show Details</span>
        </button>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="space-y-6 p-0"
    >
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Booking Summary</h2>

      <div className="space-y-3">
        {details.eventType && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Type</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">{details.eventType}</dd>
          </div>
        )}
        {details.date && isValid(dateValue) && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Date & Time</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">
              {format(dateValue, 'PPP')}
              {details.time && ` at ${details.time}`}
            </dd>
          </div>
        )}
        {details.location && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Location</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">
              {cleanLocation(details.location)}
            </dd>
          </div>
        )}
        {details.eventDescription && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Details</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">{details.eventDescription}</dd>
          </div>
        )}
        {details.guests && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Guests</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">{details.guests}</dd>
          </div>
        )}
        {details.venueType && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Venue</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">{details.venueType}</dd>
          </div>
        )}
        {details.sound && (
          <div className="flex items-center justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Sound Needed</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">
              {details.sound === 'yes' ? 'Yes' : 'No'}
            </dd>
          </div>
        )}
        {details.notes && (
          <div className="flex items-start justify-between py-1 border-b border-gray-100 last:border-b-0">
            <dt className="text-sm font-medium text-gray-700 flex-shrink-0 w-1/3">Notes</dt>
            <dd className="text-sm text-gray-900 text-right flex-grow">{details.notes}</dd>
          </div>
        )}
      </div>

      <div className="flex justify-center w-full mt-[var(--space-px)]">
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-800 font-medium py-2 text-sm flex items-center justify-center space-x-1 cursor-pointer"
        >
          <span className="text-xs">Hide Details</span>
        </button>
      </div>
    </motion.div>
  );
}
