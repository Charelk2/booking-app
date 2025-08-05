'use client';
import { useState, useRef } from 'react';
import { Control, Controller } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button, CollapsibleSection } from '../../ui';

import { EventDetails } from '@/contexts/BookingContext';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function SoundStep({
  control,
  open = true,
  onToggle = () => {},
}: Props) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  return (
    <CollapsibleSection
      title="Sound"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
      <p className="text-sm text-gray-600">Will sound equipment be needed?</p>
      <Controller<EventDetails, 'sound'>
        name="sound"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSheetOpen(true)}
                  className="w-full text-left min-h-[44px]"
                  ref={buttonRef}
                >
                  {field.value ? `Sound: ${field.value === 'yes' ? 'Yes' : 'No'}` : 'Select sound preference'}
                </Button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                >
                  <fieldset className="p-4 space-y-2">
                    {['yes', 'no'].map((opt, idx) => (
                      <div key={opt}>
                        <input
                          id={`sound-${opt}-mobile`}
                          ref={idx === 0 ? firstRadioRef : undefined}
                          type="radio"
                          className="selectable-card-input"
                          name={field.name}
                          value={opt}
                          checked={field.value === opt}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            setSheetOpen(false);
                          }}
                        />
                        <label htmlFor={`sound-${opt}-mobile`} className="selectable-card">
                          {opt === 'yes' ? 'Yes' : 'No'}
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="space-y-2 sm:flex sm:space-y-0 sm:gap-2">
                <div>
                  <input
                    id="sound-yes"
                    type="radio"
                    className="selectable-card-input"
                    name={field.name}
                    value="yes"
                    checked={field.value === 'yes'}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <label htmlFor="sound-yes" className="selectable-card">
                    Yes
                  </label>
                </div>
                <div>
                  <input
                    id="sound-no"
                    type="radio"
                    className="selectable-card-input"
                    name={field.name}
                    value="no"
                    checked={field.value === 'no'}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                  <label htmlFor="sound-no" className="selectable-card">
                    No
                  </label>
                </div>
              </fieldset>
            )}
          </>
        )}
      />
    </CollapsibleSection>
  );
}