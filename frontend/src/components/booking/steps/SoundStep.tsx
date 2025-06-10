'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function SoundStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <fieldset className="space-y-2">
            <legend className="font-medium">Is sound needed?</legend>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="yes"
                checked={field.value === 'yes'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="no"
                checked={field.value === 'no'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>No</span>
            </label>
          </fieldset>
        )}
      />
    </div>
  );
}
