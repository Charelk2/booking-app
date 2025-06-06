'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import Button from '../../ui/Button';

interface Props {
  control: Control<FieldValues>;
  onNext: () => void;
}

export default function GuestsStep({ control, onNext }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Number of guests</label>
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <input
            type="number"
            min={1}
            className="border p-2 rounded w-full"
            {...field}
          />
        )}
      />
      {isMobile && (
        <Button data-testid="guests-next-button" onClick={onNext} fullWidth>
          Next
        </Button>
      )}
    </div>
  );
}
