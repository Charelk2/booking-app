'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <fieldset className="space-y-2">
            <legend className="font-medium">Venue Type</legend>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="indoor"
                checked={field.value === 'indoor'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Indoor</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="outdoor"
                checked={field.value === 'outdoor'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Outdoor</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="hybrid"
                checked={field.value === 'hybrid'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Hybrid</span>
            </label>
          </fieldset>
        )}
      />
    </div>
  );
}
