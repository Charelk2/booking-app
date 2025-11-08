import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function validatePhoneNumber(
  value: string,
  defaultCountry: string = 'ZA' // or 'US', depending on your app’s base
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
