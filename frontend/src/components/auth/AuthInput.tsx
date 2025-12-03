import { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import React from 'react';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
}


export default function AuthInput({
  label,
  registration,
  error,
  id,
  ...props
}: AuthInputProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium leading-6 text-gray-900">
        {label}
      </label>
      <div className="mt-2">
        <input
          id={id}
          {...registration}
          {...props}
          className="block w-full rounded-md border border-transparent bg-white py-2 px-3 text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-black focus:ring-1 focus:ring-black sm:text-sm sm:leading-6"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error.message}</p>}
      </div>
    </div>
  );
}
