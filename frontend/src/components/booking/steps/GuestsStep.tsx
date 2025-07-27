'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput } from '../../ui';

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
    <div className="wizard-step-container">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Guests</h2>
      <p className="text-lg text-gray-600 mb-6">How many people?</p>
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <TextInput
            type="number"
            min={1}
            label="Number of guests"
            className="w-full p-4 rounded-lg border border-gray-300 text-lg text-gray-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all duration-200 ease-in-out"
            {...field}
            autoFocus={!isMobile}
          />
        )}
        />
    </div>
  );
}
