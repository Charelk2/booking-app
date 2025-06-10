'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function SoundStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <label className="block mb-2 font-medium">Is sound needed?</label>
      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <div className="space-y-2">
            <label>
              <input
                type="radio"
                name={field.name}
                value="yes"
                checked={field.value === 'yes'}
                onChange={(e) => field.onChange(e.target.value)}
                className="mr-1"
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name={field.name}
                value="no"
                checked={field.value === 'no'}
                onChange={(e) => field.onChange(e.target.value)}
                className="mr-1"
              />
              No
            </label>
          </div>
        )}
      />
    </div>
  );
}
