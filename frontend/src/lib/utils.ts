import api from './api';
import { Service } from '@/types';
import { addDays } from 'date-fns';

export const getFullImageUrl = (relativePath: string | undefined | null): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const cleanPath = relativePath.startsWith('/static/') ? relativePath : `/static/${relativePath.replace(/^\/+/, '')}`;
  return `${api.defaults.baseURL}${cleanPath}`;
};

export const extractErrorMessage = (detail: unknown): string => {
  if (!detail) return 'An unexpected error occurred.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === 'object' && d && 'msg' in d) {
          const record = d as Record<string, unknown>;
          return record.msg as string;
        }
        return JSON.stringify(d);
      })
      .join(', ');
  }
  if (typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    if (typeof record.msg === 'string') return record.msg;
    return JSON.stringify(detail);
  }
  return String(detail);
};

export const normalizeService = (service: Service): Service => ({
  ...service,
  price:
    typeof service.price === 'string'
      ? parseFloat(service.price)
      : service.price,
  duration_minutes:
    typeof service.duration_minutes === 'string'
      ? parseInt(service.duration_minutes as unknown as string, 10)
      : service.duration_minutes,
});

/**
 * Given a list of unavailable date strings, return the next available
 * dates starting from today. Used for the sidebar availability preview.
 *
 * @param unavailable Array of `YYYY-MM-DD` dates that are not bookable.
 * @param maxCount Maximum number of dates to return.
 * @param daysAhead How many days ahead to search for availability.
 * @param startDate Date to begin searching from (defaults to today).
 */
export const getNextAvailableDates = (
  unavailable: string[],
  maxCount = 5,
  daysAhead = 60,
  startDate: Date = new Date(),
): Date[] => {
  const set = new Set(unavailable);
  const results: Date[] = [];
  for (let i = 0; i < daysAhead && results.length < maxCount; i += 1) {
    const candidate = addDays(startDate, i);
    const iso = candidate.toISOString().slice(0, 10);
    if (!set.has(iso)) {
      results.push(candidate);
    }
  }
  return results;
};
