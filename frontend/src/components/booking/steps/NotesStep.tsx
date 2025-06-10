'use client';
// Notes and optional attachment upload.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';

interface Props {
  control: Control<FieldValues>;
  setValue: (name: string, value: unknown) => void;
}

export default function NotesStep({ control, setValue }: Props) {
  const isMobile = useIsMobile();
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await uploadBookingAttachment(formData);
    if (res?.data?.url) {
      setValue('attachment_url', res.data.url);
      toast.success('Attachment uploaded');
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Anything else we should know?</p>
      <label className="block text-sm font-medium">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            className="border p-2 rounded w-full"
            {...field}
            autoFocus={!isMobile}
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
    </div>
  );
}
