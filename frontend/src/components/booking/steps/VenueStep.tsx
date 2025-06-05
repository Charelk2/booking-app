'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium">Venue type</label>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <select className="border p-2 rounded w-full" {...field}>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="hybrid">Hybrid</option>
          </select>
        )}
      />
    </div>
  );
}
