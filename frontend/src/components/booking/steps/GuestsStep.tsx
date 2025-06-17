'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control, FieldValues } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';

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
    <div className="space-y-4">
      <label className="block text-sm font-medium">Number of guests</label>
      <p className="text-sm text-gray-600">How many people?</p>
      <Controller
        name="guests"
        control={control}
        render={({ field }) => (
          <input
            type="number"
            min={1}
            className="border p-3 rounded w-full text-lg"
            {...field}
            autoFocus={!isMobile}
          />
        )}
      />
      <p className="text-xs text-gray-600">Max capacity is 200 guests.</p>
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Back
          </button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
