'use client';

import React from 'react';
import PhoneInput, { type PhoneInputProps } from '@/components/phone/PhoneInputCompat';

type Props = {
  id?: string;
  label?: string;
  value?: PhoneInputProps['value']; // string | undefined (E.164)
  onChange: (v: PhoneInputProps['value']) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

export default function PhoneNumberField({
  id = 'phone_number',
  label = 'Phone number',
  value,
  onChange,
  error,
  required,
  disabled,
}: Props) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 dark:text-gray-100">
        {label} {required && <span className="text-red-600">*</span>}
      </label>

      <div
        className={[
          'rounded-lg border bg-white text-gray-900 shadow-sm',
          'focus-within:ring-2 focus-within:ring-brand/60 focus-within:border-brand',
          'dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700',
          error ? 'border-red-500 focus-within:ring-red-500 focus-within:border-red-500' : 'border-gray-300',
        ].join(' ')}
      >
        <PhoneInput
          id={id}
          international
          defaultCountry="ZA"
          countries={['ZA']}             // ZA only
          addInternationalOption={false} // lock to +27
          value={value}
          onChange={onChange}
          disabled={disabled}
          numberInputProps={{
            name: id,
            autoComplete: 'tel',
            className: 'w-full bg-transparent px-3 py-2 text-sm outline-none',
            'aria-invalid': !!error || undefined,
            'aria-describedby': error ? `${id}-error` : undefined,
            placeholder: '+27 82 123 4567',
          }}
          className="phone-input flex items-center gap-2 px-2 py-1"
        />
      </div>

      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
