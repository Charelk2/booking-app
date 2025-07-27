'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button } from '../../ui';
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
    <div className="wizard-step-container">
      <p className="instruction-text">What type of venue is it?</p>
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
                      <label key={opt.value} className="selectable-card">
                        <input
                          ref={idx === 0 ? firstRadioRef : undefined}
                          type="radio"
                          className="selectable-card-input"
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
                  <label key={opt.value} className="selectable-card">
                    <input
                      type="radio"
                      className="selectable-card-input"
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
