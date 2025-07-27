'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button } from '../../ui';
import WizardNav from '../WizardNav';
import clsx from 'clsx';

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
      <p className="text-sm text-gray-600">What type of venue is it?</p>
      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                <Button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  variant="secondary"
                  className="w-full text-left min-h-[44px]"
                  ref={buttonRef}
                >
                  {field.value
                    ? `Venue: ${field.value.charAt(0).toUpperCase()}${field.value.slice(1)}`
                    : 'Select venue type'}
                </Button>
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
              <fieldset className="space-y-4">
                <legend className="font-medium sr-only">Venue Type</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {options.map((opt) => (
                    <label
                      key={opt.value}
                      htmlFor={field.name + '-' + opt.value}
                      className={clsx(
                        'block cursor-pointer border rounded-lg p-4 transition-all duration-200 ease-in-out',
                        'hover:border-gray-400 hover:shadow-sm',
                        {
                          'border-brand bg-brand-light': field.value === opt.value,
                          'border-gray-200 bg-white': field.value !== opt.value,
                        },
                      )}
                    >
                      <input
                        type="radio"
                        id={field.name + '-' + opt.value}
                        name={field.name}
                        value={opt.value}
                        checked={field.value === opt.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="sr-only"
                      />
                      <span
                        className={clsx('font-medium text-lg', {
                          'text-brand': field.value === opt.value,
                          'text-gray-900': field.value !== opt.value,
                        })}
                      >
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </>
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
