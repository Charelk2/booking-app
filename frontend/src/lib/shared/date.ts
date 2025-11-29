import { format } from 'date-fns';

/**
 * Format a Date to YYYY-MM-DD in the local timezone.
 * Keeps formatting logic reusable across web and future RN surfaces.
 */
export function formatDateYMDLocal(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
