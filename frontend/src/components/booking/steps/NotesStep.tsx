'use client';

import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile'; // Might not be directly used for styling, but kept for context
import { uploadBookingAttachment } from '@/lib/api'; // Assume this API call exists
import toast from '../../ui/Toast'; // Assume Toast component exists
import { useState } from 'react';
import WizardNav from '../WizardNav'; // Assuming WizardNav handles its own btn styling
import clsx from 'clsx'; // For conditional classes

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

    setUploading(true);
    setProgress(0);
    try {
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
    <div className="wizard-step-container"> {/* THE ONE CARD FOR THIS STEP */}
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Additional Notes</h2>
      <p className="text-lg text-gray-600 mb-6">Please add any specific notes or attachments for your booking.</p>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-base font-semibold text-gray-900">Extra notes</legend> {/* Visible legend */}
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              id="notes"
              rows={4}
              placeholder="E.g., Special requests, parking instructions, specific stage requirements..."
              className="w-full h-auto min-h-[120px] p-4 rounded-lg border border-gray-300 text-lg text-gray-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all duration-200 ease-in-out" /* Direct styling */
              autoFocus={!isMobile}
            />
          )}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-base font-semibold text-gray-900">Attachment (optional)</legend> {/* Visible legend */}
        <input
          id="attachment"
          type="file"
          aria-label="Upload attachment"
          className="w-full flex items-center justify-center p-4 rounded-lg border border-gray-300 text-lg text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-base file:font-semibold file:bg-brand-light-tint file:text-brand-primary hover:file:bg-gray-200 hover:file:text-gray-700 transition-all duration-200 ease-in-out cursor-pointer" /* Direct styling for file input */
          onChange={handleFileChange}
        />
        {uploading && (
          <div className="flex items-center gap-2 mt-2 w-full" role="progressbar" aria-label="Upload progress"
               aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}%`} aria-live="polite">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-brand-primary h-2 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm text-gray-600">{progress}%</span>
          </div>
        )}
      </fieldset>

      {/* WizardNav is assumed to be rendered by a parent component that wraps the steps */}
    </div>
  );
}
