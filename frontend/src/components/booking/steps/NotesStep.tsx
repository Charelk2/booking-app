'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import Button from '../../ui/Button';

interface Props {
  control: Control<FieldValues>;
  onNext: () => void;
}

export default function NotesStep({ control, onNext }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea rows={3} className="border p-2 rounded w-full" {...field} />
        )}
      />
      {isMobile && (
        <Button data-testid="notes-next-button" onClick={onNext} fullWidth>
          Next
        </Button>
      )}
    </div>
  );
}
