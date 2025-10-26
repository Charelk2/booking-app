export interface ParsedBookingDetails {
  eventType?: string;
  description?: string;
  date?: string;
  location?: string;
  guests?: string;
  venueType?: string;
  soundNeeded?: string;
  notes?: string;
}

import { BOOKING_DETAILS_PREFIX } from '@/lib/constants';

export function parseBookingDetailsFromMessage(content: string): ParsedBookingDetails {
  const details: ParsedBookingDetails = {};
  const lines = content.replace(BOOKING_DETAILS_PREFIX, '').trim().split('\n');
  lines.forEach((line) => {
    const parts = line.split(':');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join(':').trim();
      switch (key) {
        case 'Event Type':
          details.eventType = value;
          break;
        case 'Description':
          details.description = value;
          break;
        case 'Date':
          details.date = value;
          break;
        case 'Location':
          details.location = value;
          break;
        case 'Guests':
          details.guests = value;
          break;
        case 'Venue':
          details.venueType = value;
          break;
        case 'Sound':
          details.soundNeeded = value;
          break;
        case 'Notes':
          details.notes = value;
          break;
        default:
          break;
      }
    }
  });
  return details;
}
