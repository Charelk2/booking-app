'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import Button from '../../ui/Button';

interface Props {
  control: Control<FieldValues>;
  onNext: () => void;
}

export default function VenueStep({ control, onNext }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="space-y-2">
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
      {isMobile && (
        <Button data-testid="venue-next-button" onClick={onNext} fullWidth>
          Next
        </Button>
      )}
    </div>
  );
}
