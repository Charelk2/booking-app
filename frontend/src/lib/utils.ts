import api from './api';
import { DEFAULT_CURRENCY } from './constants';
import { Service, QuoteTemplate } from '@/types';
import { addDays, format } from 'date-fns';
import axios from 'axios';

export const getFullImageUrl = (
  relativePath: string | undefined | null,
): string | null => {
  if (!relativePath) return null;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }

  const cleanPath = relativePath.startsWith('/static/')
    ? relativePath
    : `/static/${relativePath.replace(/^\/+/, '')}`;

  let base = api.defaults.baseURL || '';
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api(?:\/v\d+)?$/, '');

  return `${base}${cleanPath}`;
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
    if (record.field_errors && typeof record.field_errors === 'object') {
      const msgs = Object.values(record.field_errors as Record<string, string>).join(', ');
      if (typeof record.message === 'string') {
        return `${record.message}: ${msgs}`;
      }
      return msgs;
    }
    if (typeof record.msg === 'string') return record.msg;
    return JSON.stringify(detail);
  }
  return String(detail);
};

export function formatCurrency(
  value: number,
  currency = DEFAULT_CURRENCY,
  locale = 'en-ZA',
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

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
 * Apply sequential display_order values to the provided services.
 * The returned array maintains the input order.
 */
export const applyDisplayOrder = (services: Service[]): Service[] =>
  services.map((s, i) => ({ ...s, display_order: i + 1 }));

/**
 * Return a user-friendly message based on whether the error was
 * caused by an unauthenticated request.
 */
export const authAwareMessage = (
  err: unknown,
  fallback: string,
  authMessage: string,
): string => {
  if (axios.isAxiosError(err) && err.response?.status === 401) {
    return authMessage;
  }
  return fallback;
};

/**
 * Return only the street portion of a full address string.
 * Useful for compact UI where space is limited.
 */
export const getStreetFromAddress = (address: string): string => {
  if (!address) return '';
  const [street] = address.split(',');
  return street.trim();
};

export const normalizeQuoteTemplate = (
  tmpl: QuoteTemplate,
): QuoteTemplate => ({
  ...tmpl,
  sound_fee:
    typeof tmpl.sound_fee === 'string'
      ? parseFloat(tmpl.sound_fee)
      : tmpl.sound_fee,
  travel_fee:
    typeof tmpl.travel_fee === 'string'
      ? parseFloat(tmpl.travel_fee)
      : tmpl.travel_fee,
  discount:
    tmpl.discount == null
      ? tmpl.discount
      : typeof tmpl.discount === 'string'
        ? parseFloat(tmpl.discount)
        : tmpl.discount,
  services: tmpl.services.map((s) => ({
    ...s,
    price: typeof s.price === 'string' ? parseFloat(s.price as unknown as string) : s.price,
  })),
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

/** Mapping of internal status codes to user-friendly labels. */
export const STATUS_LABELS: Record<string, string> = {
  pending_quote: 'Pending Quote',
  quote_provided: 'Quote Provided',
  pending_artist_confirmation: 'Pending Artist Confirmation',
  request_confirmed: 'Request Confirmed',
  request_completed: 'Request Completed',
  request_declined: 'Request Declined',
  request_withdrawn: 'Request Withdrawn',
  quote_rejected: 'Quote Rejected',
  pending_client_action: 'Pending Client Action',
  accepted_by_client: 'Accepted by Client',
  rejected_by_client: 'Rejected by Client',
  confirmed_by_artist: 'Confirmed by Artist',
  withdrawn_by_artist: 'Withdrawn by Artist',
  expired: 'Expired',
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  deposit_paid: 'Deposit Paid',
  paid: 'Paid',
};

const capitalize = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Convert an internal status string like `pending_quote` to a human readable
 * label ("Pending Quote"). Unknown statuses are humanised by splitting on
 * underscores and capitalising each word.
 */
export const formatStatus = (status: string): string =>
  STATUS_LABELS[status] || status.split('_').map(capitalize).join(' ');

export const formatDepositReminder = (
  amount?: number,
  dueDate?: string | Date,
): string => {
  const parts: string[] = [];
  const formattedAmount =
    amount !== undefined ? formatCurrency(Number(amount)) : undefined;
  if (formattedAmount) {
    parts.push(`Deposit ${formattedAmount}`);
  } else {
    parts.push('Deposit');
  }
  if (dueDate) {
    const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    parts.push(`due by ${format(d, 'MMM d, yyyy')}`);
  } else {
    parts.push('due');
  }
  return parts.join(' ');
};

/**
 * Generate a human-readable quote number like "Quote #2025-1234".
 */
export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `Quote #${year}-${rand}`;
}
