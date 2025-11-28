import { DEFAULT_CURRENCY } from './constants';
import { Service, QuoteTemplate } from '@/types';
import { addDays, format } from 'date-fns';
import axios from 'axios';

// Compute an API origin without importing the axios instance to avoid cycles.
function apiBaseOrigin(): string {
  const env = process.env.NEXT_PUBLIC_API_URL || '';
  let base = env || '';
  try {
    if (!base && typeof window !== 'undefined') base = window.location.origin;
    const u = new URL(base);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  } catch {
    return '';
  }
}

export const getFullImageUrl = (
  relativePath: string | undefined | null,
): string | null => {
  if (!relativePath) return null;
  const input = String(relativePath).trim();
  if (!input) return null;
  const sanitized = input.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
  if (
    sanitized.startsWith('http://') ||
    sanitized.startsWith('https://') ||
    sanitized.startsWith('data:') ||
    sanitized.startsWith('blob:')
  ) {
    // Guard against non-image external URLs (e.g., social profile pages)
    try {
      if (sanitized.startsWith('data:') || sanitized.startsWith('blob:')) return sanitized;
      const u = new URL(sanitized);
      const host = u.hostname.toLowerCase();
      const origPath = u.pathname; // preserve case
      // If this is our own domain and the path points to a known mount without /static,
      // normalize to /static/<mount>/... so it works behind the API server.
      if (/(^|\.)booka\.co\.za$/i.test(host)) {
        const mDirect = origPath.match(/^\/(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i);
        if (mDirect) {
          const normalized = `${u.protocol}//${u.host}/static/${mDirect[1]}/${mDirect[2]}${u.search}`;
          return normalized;
        }
      }
      // Do NOT rewrite /static to direct mounts for other external URLs; production may serve
      // only under /static. Just return the URL if it looks like an image.
      const hasImageExt = /(\.png|\.jpg|\.jpeg|\.webp|\.gif|\.svg|\.avif)(\?|$)/i.test(origPath);
      if (hasImageExt) return sanitized;
      // Any external URL without an image extension is treated as a profile/page link.
      // Fall back to our default avatar to avoid next/image host errors.
      let base = apiBaseOrigin() || '';
      base = base.replace(/\/+$/, '');
      base = base.replace(/\/api(?:\/v\d+)?$/, '');
      return `/default-avatar.svg`;
    } catch {
      return sanitized;
    }
  }

  // Normalize known upload directories to their direct mounts (not /static)
  const stripLeading = sanitized.replace(/^\/+/, '');
  // Special-case avatars: prefer R2 public base when configured
  if (stripLeading.startsWith('avatars/')) {
    const r2 = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (r2) return `${r2}/${stripLeading}`;
    // Fallback to static mount if no R2 base is configured
    let base = apiBaseOrigin() || '';
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/api(?:\/v\d+)?$/, '');
    return `${base}/static/${stripLeading}`;
  }
  // Special-case cover/portfolio/media: prefer R2 public base when configured
  if (stripLeading.startsWith('cover_photos/') || stripLeading.startsWith('portfolio_images/') || stripLeading.startsWith('media/')) {
    const r2 = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    if (r2) return `${r2}/${stripLeading}`;
    let base = apiBaseOrigin() || '';
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/api(?:\/v\d+)?$/, '');
    return `${base}/static/${stripLeading}`;
  }
  // Allow API image proxy paths to pass through without /static
  if (stripLeading.startsWith('api/')) {
    let base = apiBaseOrigin() || '';
    base = base.replace(/\/+$/, '');
    base = base.replace(/\/api(?:\/v\d+)?$/, '');
    return `${base}/${stripLeading}`;
  }
  const isUploadPath = (
    stripLeading.startsWith('profile_pics/') ||
    stripLeading.startsWith('cover_photos/') ||
    stripLeading.startsWith('portfolio_images/') ||
    stripLeading.startsWith('attachments/') ||
    stripLeading.startsWith('media/')
  );
  // Always serve via /static for relative paths to match production hosting
  const cleanPath = sanitized.startsWith('/static/')
    ? sanitized
    : isUploadPath
      ? `/static/${stripLeading}`
      : `/static/${stripLeading}`;

  let base = apiBaseOrigin() || '';
  base = base.replace(/\/+$/, '');
  base = base.replace(/\/api(?:\/v\d+)?$/, '');

  return `${base}${cleanPath}`;
};

// Convert a user-provided URL or path into a canonical storage form for
// uploaded assets. Keeps case intact and strips any /static prefix and host
// when pointing at our API origin. External URLs are returned unchanged.
export const normalizeAssetPathForStorage = (input: string): string => {
  const v = (input || '').trim().replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');
  if (!v) return v;

  const MOUNTS = /^(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i;
  const STATIC_PREFIX = /^\/static\/(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i;
  const DIRECT_PREFIX = /^\/(profile_pics|cover_photos|portfolio_images|attachments)\/(.*)$/i;

  // Relative paths
  if (v.startsWith('/')) {
    const mStatic = v.match(STATIC_PREFIX);
    if (mStatic) return `${mStatic[1]}/${mStatic[2]}`; // strip /static/, preserve case
    const mDirect = v.match(DIRECT_PREFIX);
    if (mDirect) return `${mDirect[1]}/${mDirect[2]}`; // strip leading slash
    return v; // Leave other absolute paths as-is
  }
  const mMount = v.match(MOUNTS);
  if (mMount) return `${mMount[1]}/${mMount[2]}`; // already canonical

  // Absolute URLs
  try {
    const u = new URL(v);
    const host = u.hostname.toLowerCase();
    // Any of our known hosts
    if (/(^|\.)booka\.co\.za$/i.test(host)) {
      const mStatic = u.pathname.match(STATIC_PREFIX);
      if (mStatic) return `${mStatic[1]}/${mStatic[2]}`;
      const mDirect = u.pathname.match(DIRECT_PREFIX);
      if (mDirect) return `${mDirect[1]}/${mDirect[2]}`;
    }
    // External: return unchanged
    return v;
  } catch {
    // Not a valid URL and not one of our mounts: try to coerce later
    return v;
  }
};

// Build a receipt URL from payment info. Prefers explicit receiptUrl, then PayFast base + payment_id.
export const buildReceiptUrl = (
  receiptUrl?: string | null,
  paymentId?: string | null,
): string | null => {
  if (receiptUrl) return receiptUrl;
  const base =
    process.env.NEXT_PUBLIC_RECEIPT_BASE_URL ||
    process.env.NEXT_PUBLIC_PAYFAST_RECEIPT_BASE_URL ||
    '';
  if (base && paymentId) return `${base.replace(/\/$/, '')}/${paymentId}`;
  return null;
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

/**
 * Extract the city or town portion from a full address string.
 * Known country and province segments are stripped from the end so
 * that only the most relevant location name is returned.
 */
export const getCityFromAddress = (address: string): string => {
  if (!address) return '';
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const countries = ['south africa'];
  const provinces = [
    'eastern cape',
    'western cape',
    'northern cape',
    'gauteng',
    'kwazulu-natal',
    'limpopo',
    'mpumalanga',
    'north west',
    'free state',
  ];
  while (parts.length > 1) {
    const lastRaw = parts[parts.length - 1];
    const last = lastRaw.toLowerCase();
    if (
      countries.includes(last) ||
      provinces.includes(last) ||
      /^\d{4,}$/.test(last)
    ) {
      parts.pop();
    } else {
      break;
    }
  }
  return parts[parts.length - 1] ?? '';
};

/**
 * Extract the South African province from an address string, if present.
 * Returns a nicely capitalized name like "Western Cape" or an empty string if not found.
 */
export const getProvinceFromAddress = (address: string): string => {
  if (!address) return '';
  const provinces = [
    'eastern cape',
    'western cape',
    'northern cape',
    'gauteng',
    'kwazulu-natal',
    'limpopo',
    'mpumalanga',
    'north west',
    'free state',
  ];
  const lower = address.toLowerCase();
  let match = provinces.find((p) => lower.includes(p));
  // Fallback by city if province is not explicitly present
  if (!match) {
    const cityToProvince: Record<string, string> = {
      // Western Cape
      'cape town': 'western cape',
      'stellenbosch': 'western cape',
      'paarl': 'western cape',
      'somerset west': 'western cape',
      'strand': 'western cape',
      'mossel bay': 'western cape',
      'george': 'western cape',
      'knysna': 'western cape',
      'hermanus': 'western cape',
      'malmesbury': 'western cape',
      // Gauteng
      'johannesburg': 'gauteng',
      'sandton': 'gauteng',
      'soweto': 'gauteng',
      'pretoria': 'gauteng',
      'centurion': 'gauteng',
      // KwaZulu-Natal
      'durban': 'kwazulu-natal',
      'pietermaritzburg': 'kwazulu-natal',
      'umhlanga': 'kwazulu-natal',
      // Eastern Cape
      'gqeberha': 'eastern cape',
      'port elizabeth': 'eastern cape',
      'east london': 'eastern cape',
      // Free State
      'bloemfontein': 'free state',
      // Northern Cape
      'kimberley': 'northern cape',
      // Limpopo
      'polokwane': 'limpopo',
      // Mpumalanga
      'mbombela': 'mpumalanga',
      'nelspruit': 'mpumalanga',
      // North West
      'mafikeng': 'north west',
      'mahikeng': 'north west',
    };
    const foundCity = Object.keys(cityToProvince).find((city) => lower.includes(city));
    if (foundCity) match = cityToProvince[foundCity];
  }
  if (!match) return '';
  // Capitalize each word and handle hyphenated names
  const words = match.split(/([ -])/); // keep separators
  return words
    .map((w) => (/^[ -]$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
};

/**
 * Return a compact location display: "Town, Province" when available; otherwise just the town.
 */
export const getTownProvinceFromAddress = (address: string): string => {
  const city = getCityFromAddress(address);
  const province = getProvinceFromAddress(address);
  return province ? `${city}, ${province}` : city;
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
  pending_artist_confirmation: 'Pending Service Provider Confirmation',
  request_confirmed: 'Request Confirmed',
  request_completed: 'Request Completed',
  request_declined: 'Request Declined',
  request_withdrawn: 'Request Withdrawn',
  quote_rejected: 'Quote Rejected',
  pending_client_action: 'Pending Client Action',
  accepted_by_client: 'Accepted by Client',
  rejected_by_client: 'Rejected by Client',
  confirmed_by_artist: 'Confirmed by Service Provider',
  withdrawn_by_artist: 'Withdrawn by Service Provider',
  expired: 'Expired',
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
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

// Deposits removed — no deposit reminder formatting

/**
 * Generate a human-readable quote number like "Quote #2025-1234".
 */
export function generateQuoteNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `Quote #${year}-${rand}`;
}
