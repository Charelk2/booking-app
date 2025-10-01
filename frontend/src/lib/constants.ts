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
 * Controls the staged secondary pipeline for ancillary inbox data (quotes,
 * booking context, payments). Defaults to disabled so we can opt-in per env.
 */
export const FEATURE_INBOX_SECONDARY_PIPELINE: boolean = (() => {
  const raw = (process.env.NEXT_PUBLIC_INBOX_SECONDARY_PIPELINE_ENABLED || '').trim().toLowerCase();
  if (!raw) return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return false;
})();

/**
 * Fetch the default currency from `/api/v1/settings` when not provided via
 * environment variables. The resolved value updates `DEFAULT_CURRENCY` so
 * subsequent calls use the fetched value.
 */
export async function fetchDefaultCurrency(): Promise<string> {
  if (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY) {
    return DEFAULT_CURRENCY;
  }
  try {
    const res = await fetch('/api/v1/settings');
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
