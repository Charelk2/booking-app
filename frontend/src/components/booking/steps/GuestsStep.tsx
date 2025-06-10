'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';

interface Props {
  control: Control<FieldValues>;
}

export default function GuestsStep({ control }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Number of guests</label>
      <p className="text-sm text-gray-600">How many people?</p>
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <input
            type="number"
            min={1}
            className="border p-3 rounded w-full text-lg"
            {...field}
            autoFocus={!isMobile}
          />
        )}
      />
      <p className="text-xs text-gray-600">Max capacity is 200 guests.</p>
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
