'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function SoundStep({ control }: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium mb-2">Is sound needed?</label>
      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <div className="space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="yes"
                checked={field.value === 'yes'}
                onChange={() => field.onChange('yes')}
                className="mr-1"
              />
              Yes
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                value="no"
                checked={field.value === 'no'}
                onChange={() => field.onChange('no')}
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
