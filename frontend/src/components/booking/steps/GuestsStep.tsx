'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput, CollapsibleSection } from '../../ui';
import { EventDetails } from '@/contexts/BookingContext';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function GuestsStep({ control, open = true, onToggle = () => {} }: Props) {
  const isMobile = useIsMobile();

  return (
    <CollapsibleSection
      title="Guests"
      description="How many people?"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container rounded-2xl border border-black/10 bg-white p-6 shadow-sm"
    >
      <Controller<EventDetails, 'guests'> // Explicitly type Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <TextInput
            type="number"
            min={1}
            {...field}
            value={field.value ? String(field.value) : ''}
            autoFocus={!isMobile}
            className="input-base text-lg rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black focus:ring-2 focus:ring-black"
          />
        )}
      />
    </CollapsibleSection>
  );
}
