'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput, CollapsibleSection } from '../../ui';

// Import EventDetails if your actual WizardNav uses it for deeper checks
import { EventDetails } from '@/contexts/BookingContext'; // Added EventDetails


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
      className="wizard-step-container"
    >
      <Controller<EventDetails, 'guests'> // Explicitly type Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <TextInput
            type="number"
            min={1}
            className="input-base text-lg"
            {...field}
            value={field.value ? String(field.value) : ''} // Ensure value is string
            autoFocus={!isMobile}
          />
        )}
      />
    </CollapsibleSection>
  );
}