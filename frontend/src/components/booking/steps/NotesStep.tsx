'use client';
// Notes and optional attachment upload.
import { Controller, Control, UseFormSetValue } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { uploadBookingAttachment } from '@/lib/api';
import toast from '../../ui/Toast';
import { useState } from 'react';
import { CollapsibleSection } from '../../ui';
import { EventDetails } from '@/contexts/BookingContext';

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
        if (evt.total) setProgress(Math.round((evt.loaded * 100) / evt.total));
      });
      if (res?.data?.url) {
        setValue('attachment_url', res.data.url);
        toast.success('Attachment uploaded');
      }
    } catch {
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
      className="wizard-step-container rounded-2xl border border-black/10 bg-white p-6 shadow-sm space-y-3"
    >
      <Controller<EventDetails, 'notes'>
        name="notes"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            {...field}
            value={field.value ? String(field.value) : ''}
            autoFocus={!isMobile}
            className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black min-h-[120px]"
          />
        )}
      />
      <Controller<EventDetails, 'attachment_url'>
        name="attachment_url"
        control={control}
        render={({ field }) => <input type="hidden" {...field} value={field.value ? String(field.value) : ''} />}
      />
      <label className="block text-sm font-medium text-black">Attachment (optional)</label>
      <input
        type="file"
        aria-label="Upload attachment"
        className="block w-full rounded-xl border border-black/20 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-white hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black"
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
          <div className="w-full bg-black/10 rounded h-2">
            <div className="bg-black h-2 rounded" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-black/70">{progress}%</span>
        </div>
      )}
    </CollapsibleSection>
  );
}
