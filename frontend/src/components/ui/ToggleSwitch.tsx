'use client';
import { Switch } from '@headlessui/react';
import clsx from 'clsx';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  className?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  className,
}: ToggleSwitchProps) {
  return (
    <Switch.Group as="div" className={clsx('flex items-center', className)}>
      <Switch
        checked={checked}
        onChange={onChange}
        className={clsx(
          checked ? 'bg-indigo-600' : 'bg-gray-200',
          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        )}
        data-testid="toggle-unread"
      >
        <span className="sr-only">{label}</span>
        <span
          aria-hidden="true"
          className={clsx(
            checked ? 'translate-x-4' : 'translate-x-0.5',
            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition',
          )}
        />
      </Switch>
      {label && (
        <Switch.Label className="ml-2 text-sm text-gray-700">{label}</Switch.Label>
      )}
    </Switch.Group>
  );
}
