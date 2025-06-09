'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import Button from '../../ui/Button';
import { uploadBookingAttachment } from '@/lib/api';

interface Props {
  control: Control<FieldValues>;
  setValue: (name: string, value: unknown) => void;
  onNext: () => void;
}

export default function NotesStep({ control, setValue, onNext }: Props) {
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await uploadBookingAttachment(formData);
    if (res?.data?.url) {
      setValue('attachment_url', res.data.url);
    }
  }
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            className="border p-2 rounded w-full"
            {...field}
            autoFocus
          />
        )}
      />
      <Controller
        name="attachment_url"
        control={control}
        render={({ field }) => <input type="hidden" {...field} />}
      />
      <label className="block text-sm font-medium">Attachment (optional)</label>
      <input type="file" onChange={handleFileChange} />
      {/* Mobile action buttons are handled by MobileActionBar */}
    </div>
  );
}
