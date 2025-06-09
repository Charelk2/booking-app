'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function GuestsStep({ control }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Number of guests</label>
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <input
            type="number"
            min={1}
            className="border p-2 rounded w-full"
            {...field}
            autoFocus
          />
        )}
      />
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
