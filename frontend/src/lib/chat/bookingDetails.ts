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

function normalizeDateToIso(value: string): string | undefined {
  const raw = (value || '').trim();
  if (!raw || raw.toLowerCase() === 'n/a') return undefined;

  // 1) If the environment already understands this string, trust it and
  // normalize to ISO for consistent downstream formatting.
  try {
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) {
      return direct.toISOString();
    }
  } catch {
    // fall through to manual parsing
  }

  // 2) Common SA wizard format: dd/MM/yyyy or dd/MM/yyyy HH:mm
  const m = raw.match(
    /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const day = Number(dd);
    const month = Number(mm) - 1; // JS Date months are 0-based
    const year = Number(yyyy);
    const hour = hh != null ? Number(hh) : 0;
    const minute = min != null ? Number(min) : 0;
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      year > 1900 &&
      month >= 0 &&
      month <= 11 &&
      day >= 1 &&
      day <= 31 &&
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      hour >= 0 &&
      hour < 24 &&
      minute >= 0 &&
      minute < 60
    ) {
      const d = new Date(Date.UTC(year, month, day, hour, minute));
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }

  // 3) Plain ISO date without time (e.g. 2026-09-16)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      year > 1900 &&
      month >= 0 &&
      month <= 11 &&
      day >= 1 &&
      day <= 31
    ) {
      const d = new Date(Date.UTC(year, month, day));
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    }
  }

  // If we couldn't confidently parse it, drop the date so downstream
  // components can fall back to other sources (proposed_datetime_1, etc.).
  return undefined;
}

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
        case 'Date': {
          const iso = normalizeDateToIso(value);
          if (iso) details.date = iso;
          break;
        }
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
