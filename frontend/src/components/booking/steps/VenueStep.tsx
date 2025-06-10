'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';

interface Props {
  control: Control<FieldValues>;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

export default function VenueStep({
  control,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
  return (
    <div className="space-y-4">
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <fieldset className="space-y-2">
            <legend className="font-medium">Venue Type</legend>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="indoor"
                checked={field.value === 'indoor'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Indoor</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="outdoor"
                checked={field.value === 'outdoor'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Outdoor</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name={field.name}
                value="hybrid"
                checked={field.value === 'hybrid'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Hybrid</span>
            </label>
          </fieldset>
        )}
      />
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
