'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form'; // Keep FieldValues if WizardNav uses it
import useIsMobile from '@/hooks/useIsMobile';
import { Button, TextInput } from '../../ui'; // Assuming Button and TextInput are imported
import WizardNav from '../WizardNav'; // Assuming WizardNav component exists

// Import EventDetails if your actual WizardNav uses it for deeper checks
import { EventDetails } from '@/contexts/BookingContext'; // Added EventDetails


interface Props {
  control: Control<EventDetails>; // CORRECTED: Use Control<EventDetails>
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: (e?: React.BaseSyntheticEvent) => Promise<void>; // Corrected signature
  onNext: (e?: React.BaseSyntheticEvent) => Promise<void>; // Corrected signature
}

export default function GuestsStep({
  control,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
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
      <WizardNav
        step={step}
        steps={steps}
        onBack={onBack}
        onSaveDraft={onSaveDraft}
        onNext={onNext}
      />
    </div>
  );
}