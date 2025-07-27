'use client';
// Notes and optional attachment upload.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';
import { useState } from 'react';
import WizardNav from '../WizardNav';

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
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploading(true);
      const res = await uploadBookingAttachment(formData, (evt) => {
        if (evt.total) {
          setProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      });
      if (res?.data?.url) {
        setValue('attachment_url', res.data.url);
        toast.success('Attachment uploaded');
      }
    } catch (err) {
      toast.error('Failed to upload attachment');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Please add any specific notes or attachments for your booking.</p>
      <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            {...field}
            id="notes"
            rows={4}
            placeholder="E.g., Special requests, parking instructions, specific stage requirements..."
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand focus:ring-brand min-h-[100px]"
            autoFocus={!isMobile}
          />
        )}
      />
      <Controller
        name="attachment_url"
        control={control}
        render={({ field }) => <input type="hidden" {...field} />}
      />
      <label htmlFor="attachment" className="block text-sm font-medium text-gray-700">Attachment (optional)</label>
      <input
        id="attachment"
        type="file"
        aria-label="Upload attachment"
        className="w-full rounded-md border-gray-300 shadow-sm focus:border-brand focus:ring-brand min-h-[44px] text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-dark hover:file:bg-brand-light transition-all duration-200 ease-in-out"
        onChange={handleFileChange}
      />
      {uploading && (
        <div
          className="flex items-center gap-2 mt-2"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}%`}
          aria-live="polite"
        >
          <div className="w-full bg-gray-200 rounded h-2">
            <div className="bg-brand h-2 rounded" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-600">{progress}%</span>
        </div>
      )}
      <WizardNav
        step={step}
        steps={steps}
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onNext={onNext}
        submitting={uploading}
      />
    </div>
  );
}
