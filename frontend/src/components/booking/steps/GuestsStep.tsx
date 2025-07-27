'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { Button, TextInput } from '../../ui';

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
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <TextInput
            type="number"
            min={1}
            label="Number of guests"
            className="input-base text-lg"
            {...field}
            autoFocus={!isMobile}
          />
        )}
      />
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <Button
            type="button"
            onClick={onBack}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Back
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            type="button"
            onClick={onSaveDraft}
            variant="secondary"
            className="w-full sm:w-auto min-h-[44px]"
          >
            Save Draft
          </Button>
          <Button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
