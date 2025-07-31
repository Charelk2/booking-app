'use client';
import { useBooking } from '@/contexts/BookingContext';
import { format, parseISO, isValid } from 'date-fns';
import { motion } from 'framer-motion';
import React, { useState } from 'react'; // Import useState

export default function SummarySidebar() {
  const { details } = useBooking();
  const dateValue =
    typeof details.date === 'string' ? parseISO(details.date) : details.date;

  const [isExpanded, setIsExpanded] = useState(false); // State to manage expansion

  const cleanLocation = (locationString: string) => {
    if (!locationString) return '';
    let cleaned = locationString.replace(/,?\s*South Africa/gi, '');
    cleaned = cleaned.replace(/,\s*\d{4}\s*$/, '').trim();
    cleaned = cleaned.replace(/,$/, '').trim();
    return cleaned;
  };

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <motion.div
      layout
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="space-y-6 p-0"
    >
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Booking Summary</h2>

      {/* Always visible details */}
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
      </div>

      {/* Conditionally visible details */}
      {isExpanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-3 overflow-hidden" // overflow-hidden to help with height transition
        >
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
        </motion.div>
      )}

      {/* More subtle Expand/Collapse Button - Positioned to the right */}
      <div className="flex justify-center w-full" style={{ marginTop: '0.01rem' }}>
        <button
          onClick={toggleExpanded}
          className="text-gray-400 hover:text-gray-800 font-medium py-2 text-sm flex items-center justify-center space-x-1 cursor-pointer"
        >
          <span className="text-xs">
            {isExpanded ? 'Hide Details' : 'Show More'}
          </span>
          <span className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            
          </span>
        </button>
      </div>
    </motion.div>
  );
}
