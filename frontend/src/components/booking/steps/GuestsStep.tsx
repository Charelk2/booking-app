'use client';
import { Controller } from 'react-hook-form';

interface Props {
  control: any;
}

export default function GuestsStep({ control }: Props) {
  return (
    <div>
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
          />
        )}
      />
    </div>
  );
}
