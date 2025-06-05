'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
}

export default function NotesStep({ control }: Props) {
  return (
    <div>
      <label className="block text-sm font-medium">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea rows={3} className="border p-2 rounded w-full" {...field} />
        )}
      />
    </div>
  );
}
