export const BOOKING_DETAILS_PREFIX = 'Booking details:';

/**
 * Default currency for all price displays. The value is loaded from
 * `NEXT_PUBLIC_DEFAULT_CURRENCY` when available. Otherwise `fetchDefaultCurrency`
 * can retrieve it from the API at runtime.
 */
export let DEFAULT_CURRENCY =
  process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'ZAR';

// Feature flags (string envs → booleans). Safe if missing.
export const FEATURE_EVENT_PREP: boolean = !!(
  process.env.NEXT_PUBLIC_FEATURE_EVENT_PREP &&
  process.env.NEXT_PUBLIC_FEATURE_EVENT_PREP !== '0' &&
  process.env.NEXT_PUBLIC_FEATURE_EVENT_PREP !== 'false'
);

/**
 * Fetch the default currency from `/api/v1/settings` when not provided via
 * environment variables. The resolved value updates `DEFAULT_CURRENCY` so
 * subsequent calls use the fetched value.
 */
import { apiUrl } from '@/lib/api';

export async function fetchDefaultCurrency(): Promise<string> {
  if (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY) {
    return DEFAULT_CURRENCY;
  }
  try {
    const res = await fetch(apiUrl('/api/v1/settings'));
    if (res.ok) {
      const data = await res.json();
      DEFAULT_CURRENCY = data.default_currency || DEFAULT_CURRENCY;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to load default currency', err);
  }
  return DEFAULT_CURRENCY;
}
