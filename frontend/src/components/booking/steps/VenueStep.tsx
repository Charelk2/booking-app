'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium mb-2">Venue Type</label>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <div className="space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="indoor"
                checked={field.value === 'indoor'}
                onChange={() => field.onChange('indoor')}
                className="mr-1"
              />
              Indoor
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="outdoor"
                checked={field.value === 'outdoor'}
                onChange={() => field.onChange('outdoor')}
                className="mr-1"
              />
              Outdoor
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="hybrid"
                checked={field.value === 'hybrid'}
                onChange={() => field.onChange('hybrid')}
                className="mr-1"
              />
              Hybrid
            </label>
          </div>
        )}
      />
    </div>
  );
}
