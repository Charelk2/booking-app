'use client';
import { useState, useRef } from 'react';
import { Control, Controller } from 'react-hook-form';
import clsx from 'clsx';
import useIsMobile from '@/hooks/useIsMobile';
import { EventDetails } from '@/contexts/BookingContext';
import { BottomSheet, Button } from '../../ui';
import eventTypes from '@/data/eventTypes.json';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

const options = eventTypes as string[];

export default function EventTypeStep({ control, open = true, onToggle = () => {} }: Props) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  return (
    <section className="wizard-step-container">
      <div>
        <h3 className="font-bold text-neutral-900">Event Type</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">What type of event are you planning?</p>
      </div>
      <div className="mt-6">
      <Controller<EventDetails, 'eventType'>
        name="eventType"
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
                  {field.value || 'Select event type'}
                </Button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                  title="Select event type"
                >
                  <fieldset className="p-4 space-y-2">
                    {options.map((opt, idx) => (
                      <div key={opt}>
                        <input
                          id={`type-${opt}-mobile`}
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
                        <label htmlFor={`type-${opt}-mobile`} className="selectable-card">
                          {opt}
                        </label>
                      </div>
                    ))}
                  </fieldset>
                </BottomSheet>
              </>
            ) : (
              <fieldset className="grid grid-cols-1 gap-[clamp(0.5rem,2vw,1rem)] @md:grid-cols-2 @lg:grid-cols-4">
                {options.map((opt) => (
                  <div key={opt}>
                    <input
                      id={`type-${opt}`}
                      type="radio"
                      className="selectable-card-input"
                      name={field.name}
                      value={opt}
                      checked={field.value === opt}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                    <label htmlFor={`type-${opt}`} className={clsx('selectable-card')}>
                      {opt}
                    </label>
                  </div>
                ))}
              </fieldset>
            )}
          </>
        )}
      />
      </div>
    </section>
  );
}
