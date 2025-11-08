'use client';

import * as React from 'react';
import PhoneInputDefault from 'react-phone-number-input';

/**
 * Lightweight, stable props we actually use in the app. Avoids depending on
 * upstream generics that can clash with React type versions.
 */
export type PhoneInputProps = {
  id?: string;
  value?: string | undefined;
  onChange?: (value: string | undefined) => void;
  defaultCountry?: string;
  countries?: string[];
  international?: boolean;
  addInternationalOption?: boolean;
  disabled?: boolean;
  // Optional flags mapping to bundle icons locally and avoid external CDN.
  // Usage: import flags from 'react-phone-number-input/flags'; <PhoneInput flags={flags} />
  flags?: any;
  numberInputProps?: React.InputHTMLAttributes<HTMLInputElement> & Record<string, any>;
  className?: string;
};

/**
 * Thin wrapper that forwards props to react-phone-number-input while keeping
 * our local prop types minimal and compatible.
 */
const PhoneInputCompat: React.FC<PhoneInputProps> = (props) => {
  const Cmp = PhoneInputDefault as unknown as React.ComponentType<any>;
  return <Cmp {...(props as any)} />;
};

export default PhoneInputCompat;
