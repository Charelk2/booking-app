'use client';
import { Controller, Control } from 'react-hook-form'; // Removed FieldValues
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button, CollapsibleSection } from '../../ui';

import { EventDetails } from '@/contexts/BookingContext'; // For correct Control typing

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function VenueStep({
  control,
  open = true,
  onToggle = () => {},
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
    <CollapsibleSection
      title="Venue Type"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
      <Controller<EventDetails, 'venueType'>
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
                    ? `Venue: ${String(field.value).charAt(0).toUpperCase()}${String(field.value).slice(1)}`
                    : 'Select venue type'}
                </Button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                  testId="bottom-sheet"
                >
                  <fieldset className="p-4 space-y-2">
                    {options.map((opt, idx) => (
                      <div key={opt.value}>
                        <input
                          ref={idx === 0 ? firstRadioRef : undefined}
                          id={`venue-${opt.value}-mobile`}
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
                        <label
                          htmlFor={`venue-${opt.value}-mobile`}
                          className="selectable-card"
                        >
                          {opt.label}
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="space-y-2">
                {options.map((opt) => (
                  <div key={opt.value}>
                    <input
                      id={`venue-${opt.value}`}
                      type="radio"
                      className="selectable-card-input"
                      name={field.name}
                      value={opt.value}
                      checked={field.value === opt.value}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <label htmlFor={`venue-${opt.value}`} className="selectable-card">
                      {opt.label}
                    </label>
                  </div>
                ))}
              </fieldset>
            )}
          </>
        )}
      />

    </CollapsibleSection>
  );
}