'use client';

import { forwardRef, InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  inputClassName?: string;
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ inputClassName, className, ...props }, ref) {
    return (
      <input
        ref={ref}
        type="date"
        className={clsx('w-full text-sm text-gray-700 placeholder-gray-400 bg-transparent focus:outline-none', inputClassName, className)}
        {...props}
      />
    );
  },
);

DateInput.displayName = 'DateInput';

export default DateInput;
