'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet } from '../../ui';

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
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  const options = [
    { value: 'indoor', label: 'Indoor' },
    { value: 'outdoor', label: 'Outdoor' },
    { value: 'hybrid', label: 'Hybrid' },
  ];

  return (
    <div className="space-y-4">
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-left min-h-[44px]"
                  ref={buttonRef}
                >
                  {field.value
                    ? `Venue: ${field.value.charAt(0).toUpperCase()}${field.value.slice(1)}`
                    : 'Select venue type'}
                </button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                  testId="bottom-sheet"
                >
                  <fieldset className="p-4 space-y-2">
                    <legend className="font-medium">Venue Type</legend>
                    {options.map((opt, idx) => (
                      <label key={opt.value} className="flex items-center space-x-2 py-2">
                        <input
                          ref={idx === 0 ? firstRadioRef : undefined}
                          type="radio"
                          name={field.name}
                          value={opt.value}
                          checked={field.value === opt.value}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            setSheetOpen(false);
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="space-y-2">
                <legend className="font-medium">Venue Type</legend>
                {options.map((opt) => (
                  <label key={opt.value} className="flex items-center space-x-2 py-2">
                    <input
                      type="radio"
                      name={field.name}
                      value={opt.value}
                      checked={field.value === opt.value}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
      />
      <div className="flex flex-col gap-2 mt-6 sm:flex-row sm:justify-between sm:items-center">
        {step > 0 && (
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition min-h-[44px]"
          >
            Back
          </button>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition min-h-[44px]"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={onNext}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition min-h-[44px]"
          >
            {step === steps.length - 1 ? 'Submit Request' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
