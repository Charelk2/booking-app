'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <label className="block mb-2 font-medium">Venue Type</label>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <div className="space-y-2">
            <label>
              <input
                type="radio"
                name={field.name}
                value="indoor"
                checked={field.value === 'indoor'}
                onChange={(e) => field.onChange(e.target.value)}
                className="mr-1"
              />
              Indoor
            </label>
            <label>
              <input
                type="radio"
                name={field.name}
                value="outdoor"
                checked={field.value === 'outdoor'}
                onChange={(e) => field.onChange(e.target.value)}
                className="mr-1"
              />
              Outdoor
            </label>
            <label>
              <input
                type="radio"
                name={field.name}
                value="hybrid"
                checked={field.value === 'hybrid'}
                onChange={(e) => field.onChange(e.target.value)}
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
