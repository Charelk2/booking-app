'use client';
// Optional notes are collapsed by default so the step stays short. A toast
// confirms when an attachment uploads successfully.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { useState } from 'react';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';

interface Props {
  control: Control<FieldValues>;
  setValue: (name: string, value: unknown) => void;
}

export default function NotesStep({ control, setValue }: Props) {
  const isMobile = useIsMobile();
  const [showNotes, setShowNotes] = useState(false);
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
    <div className="space-y-2">
      <p className="text-sm text-gray-600">Anything else we should know?</p>
      <button
        type="button"
        className="text-sm text-indigo-600 underline"
        onClick={() => setShowNotes(!showNotes)}
      >
        {showNotes ? 'Hide notes' : 'Add notes'}
      </button>
      {showNotes && (
        <>
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
        </>
      )}
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
