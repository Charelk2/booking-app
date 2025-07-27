'use client';

import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
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
      <h2 className="step-title">Additional Notes</h2>
      <p className="step-description">Please add any specific notes or attachments for your booking.</p>

      <fieldset className="flex flex-col gap-4">
        <legend className="input-label">Extra notes</legend> {/* Visible legend */}
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              id="notes"
              rows={4}
              placeholder="E.g., Special requests, parking instructions, specific stage requirements..."
              className="input-field w-full h-auto min-h-[120px]" /* Apply input-field styling */
              autoFocus={!isMobile}
            />
          )}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="input-label">Attachment (optional)</legend> {/* Visible legend */}
        <input
          id="attachment"
          type="file"
          aria-label="Upload attachment"
          className="input-field file-input-button" /* Apply input-field styling and special file input button styles */
          onChange={handleFileChange}
        />
        {uploading && (
          <div className="flex items-center gap-2 mt-2 w-full" role="progressbar" aria-label="Upload progress"
               aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}%`} aria-live="polite">
            <div className="w-full bg-gray-300 rounded-full h-2">
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
