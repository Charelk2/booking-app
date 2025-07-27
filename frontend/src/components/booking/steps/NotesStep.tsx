'use client';
// Notes and optional attachment upload.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';
import { useState } from 'react';
import { Button } from '../../ui';
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
      <p className="text-sm text-gray-600">Anything else we should know?</p>
      <label className="block text-sm font-medium">Extra notes</label>
      <Controller
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            className="border p-2 rounded w-full min-h-[44px]"
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
      <input
        type="file"
        aria-label="Upload attachment"
        className="min-h-[44px]"
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
          <span className="text-xs">{progress}%</span>
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
