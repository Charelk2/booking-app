'use client';
// Notes and optional attachment upload.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';

interface Props {
  control: Control<FieldValues>;
  setValue: (name: string, value: unknown) => void;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

export default function NotesStep({
  control,
  setValue,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
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
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Back
          </button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
