import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Validate phone number strings using libphonenumber.
 * Returns `true` when valid or a user-friendly error string.
 */
export function validatePhoneNumber(
  value: string,
  defaultCountry: string = 'ZA'
): true | string {
  try {
    const parsed = parsePhoneNumberFromString(value, defaultCountry as any);
    if (!parsed) return 'Invalid phone number format';
    if (!parsed.isValid()) return 'Please enter a valid phone number';
    return true;
  } catch {
    return 'Invalid phone number';
  }
}
