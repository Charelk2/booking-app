'use client';
// TODO: Replace select with a bottom-sheet style picker to prevent keyboard
// overlap on mobile devices.
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function VenueStep({ control }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Venue type</label>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <select className="border p-2 rounded w-full" {...field} autoFocus>
            <option value="indoor">Indoor</option>
            <option value="outdoor">Outdoor</option>
            <option value="hybrid">Hybrid</option>
          </select>
        )}
      />
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
