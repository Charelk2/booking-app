'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button, SelectableCard } from '../../ui';
import WizardNav from '../WizardNav';

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
                  <fieldset className="p-4 grid gap-3">
                    <legend className="font-medium mb-2">Venue Type</legend>
                    {options.map((opt, idx) => (
                      <SelectableCard
                        key={opt.value}
                        ref={idx === 0 ? firstRadioRef : undefined}
                        name={field.name}
                        value={opt.value}
                        label={opt.label}
                        checked={field.value === opt.value}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          setSheetOpen(false);
                        }}
                      />
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="grid grid-cols-3 gap-3">
                <legend className="font-medium col-span-3 mb-2">Venue Type</legend>
                {options.map((opt) => (
                  <SelectableCard
                    key={opt.value}
                    name={field.name}
                    value={opt.value}
                    label={opt.label}
                    checked={field.value === opt.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                ))}
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
