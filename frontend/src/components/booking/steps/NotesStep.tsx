'use client';
// Notes and optional attachment upload.
import { Controller, Control, UseFormSetValue } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';
import { useState } from 'react';
import { CollapsibleSection } from '../../ui';
// WizardNav is REMOVED from here.

import { EventDetails } from '@/contexts/BookingContext'; // For correct Control and setValue typing

// Props interface SIMPLIFIED: No navigation props here.
interface Props {
  control: Control<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function NotesStep({
  control,
  setValue,
  open = true,
  onToggle = () => {},
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
    <CollapsibleSection
      title="Notes"
      description="Anything else we should know?"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
      <Controller<EventDetails, 'notes'>
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            className="input-base"
            {...field}
            value={field.value ? String(field.value) : ''}
            autoFocus={!isMobile}
          />
        )}
      />
      <Controller<EventDetails, 'attachment_url'>
        name="attachment_url"
        control={control}
        render={({ field }) => (
          <input
            type="hidden"
            {...field}
            value={field.value ? String(field.value) : ''}
          />
        )}
      />
      <label className="block text-sm font-medium">Attachment (optional)</label>
      <input
        type="file"
        aria-label="Upload attachment"
        className="input-base"
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
      {/* WizardNav is REMOVED from here. Buttons are now in the parent BookingWizard's fixed footer. */}
    </CollapsibleSection>
  );
}