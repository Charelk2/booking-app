'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput } from '../../ui';

// Import EventDetails if your actual WizardNav uses it for deeper checks
import { EventDetails } from '@/contexts/BookingContext'; // Added EventDetails


interface Props {
  control: Control<EventDetails>;
}

export default function GuestsStep({ control }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="wizard-step-container">
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


    </div>
  );
}