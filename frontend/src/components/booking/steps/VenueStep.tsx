'use client';

import { Controller, Control, FieldValues } from 'react-hook-form';
import { useState, useRef } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { BottomSheet, Button } from '../../ui'; // Button is needed for mobile's BottomSheet trigger
import WizardNav from '../WizardNav'; // Assuming WizardNav handles its own btn styling
import clsx from 'clsx'; // For conditional classes

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
    <div className="wizard-step-container"> {/* THE ONE CARD FOR THIS STEP */}
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Venue Type</h2>
      <p className="text-lg text-gray-600 mb-6">What type of venue is it?</p>

      <Controller
        name="venueType"
        control={control}
        render={({ field }) => (
          <>
            {isMobile ? (
              <>
                {/* Mobile: Keep the Button and BottomSheet, style the button consistently */}
                <Button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  variant="secondary" // Assuming 'secondary' variant matches consistent button styles
                  className="w-full text-left p-4 rounded-lg border border-gray-300 text-lg text-gray-900" /* Consistent input-like button */
                  ref={buttonRef}
                >
                  {field.value
                    ? `Venue: ${field.value.charAt(0).toUpperCase()}${field.value.slice(1)}`
                    : <span className="text-gray-500">Select venue type</span>}
                </Button>
                <BottomSheet
                  open={sheetOpen}
                  onClose={() => setSheetOpen(false)}
                  initialFocus={firstRadioRef}
                  testId="bottom-sheet"
                >
                  <fieldset className="p-4 space-y-4"> {/* Internal styling for bottom sheet options */}
                    <legend className="text-xl font-semibold text-gray-900 mb-4">Select Venue Type</legend> {/* Visible legend for bottom sheet */}
                    {options.map((opt, idx) => (
                      <label
                        key={opt.value}
                        htmlFor={field.name + '-' + opt.value + '-mobile'} /* Unique ID for mobile inputs */
                        className={clsx(
                            'flex items-center justify-between p-4 rounded-lg border transition-all duration-200 ease-in-out cursor-pointer',
                            'bg-white', /* Explicitly white background */
                            { 'border-brand-primary bg-brand-light-tint': field.value === opt.value }, /* Selected state */
                            { 'border-gray-300 hover:border-gray-400': field.value !== opt.value } /* Unselected state, hover */
                        )}
                      >
                        <span className={clsx(
                          'text-lg font-semibold',
                          { 'text-brand-primary': field.value === opt.value },
                          { 'text-gray-900': field.value !== opt.value }
                        )}>
                          {opt.label}
                        </span>
                        <input
                          ref={idx === 0 ? firstRadioRef : undefined}
                          type="radio"
                          id={field.name + '-' + opt.value + '-mobile'}
                          name={field.name}
                          value={opt.value}
                          checked={field.value === opt.value}
                          onChange={(e) => {
                            field.onChange(e.target.value);
                            setSheetOpen(false); // Close sheet on selection
                          }}
                          className="sr-only"
                        />
                        {/* Optional: Add a custom checkmark or dot indicator if desired */}
                        {field.value === opt.value && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-primary ml-2">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.052-.143Z" clipRule="evenodd" />
                          </svg>
                        )}
                      </label>
                    ))}
                  </fieldset>
                  {/* BottomSheet usually has its own close/confirm buttons */}
                </BottomSheet>
              </>
            ) : (
              // Desktop: Redesign radio buttons to card style
              <fieldset>
                <legend className="sr-only">Venue Type</legend> {/* Visually hide legend */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"> {/* Grid for options */}
                  {options.map((opt) => (
                    <label
                      key={opt.value}
                      htmlFor={field.name + '-' + opt.value + '-desktop'} /* Unique ID for desktop inputs */
                      className={clsx(
                        'flex flex-col items-center justify-center p-4 rounded-lg border transition-all duration-200 ease-in-out cursor-pointer text-center',
                        'bg-white', /* Explicitly white background */
                        { 'border-brand-primary bg-brand-light-tint': field.value === opt.value }, /* Selected state */
                        { 'border-gray-300 hover:border-gray-400': field.value !== opt.value } /* Unselected state, hover */
                      )}
                    >
                      <input
                        type="radio"
                        id={field.name + '-' + opt.value + '-desktop'}
                        name={field.name}
                        value={opt.value}
                        checked={field.value === opt.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="sr-only" /* Visually hidden native input */
                      />
                      <span className={clsx(
                        'text-lg font-semibold',
                        { 'text-brand-primary': field.value === opt.value },
                        { 'text-gray-900': field.value !== opt.value }
                      )}>
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
      {/* WizardNav is assumed to be rendered by a parent component that wraps the steps */}
    </div>
  );
}
