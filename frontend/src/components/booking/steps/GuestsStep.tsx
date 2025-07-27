'use client';

import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput } from '../../ui'; // Assuming TextInput component, ensures label is handled internally

interface Props {
  control: Control<FieldValues>;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
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
    <div className="wizard-step-container"> {/* Main card for this step */}
      <h2 className="step-title">Guests</h2>
      <p className="step-description">How many people?</p>

      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          // TextInput is assumed to handle its own label rendering and apply 'input-field' class internally
          <TextInput
            type="number"
            min={1}
            label="Number of guests" // Label is likely handled by TextInput component
            className="input-field" /* Apply input-field styling */
            {...field}
            autoFocus={!isMobile}
          />
        )}
      />
      {/* WizardNav is assumed to be rendered by a parent component that wraps the steps */}
    </div>
  );
}
