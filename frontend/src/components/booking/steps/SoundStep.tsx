'use client';

import { Control, Controller, FieldValues } from 'react-hook-form';
import WizardNav from '../WizardNav'; // Assuming WizardNav handles its own btn styling
import clsx from 'clsx'; // For conditional classes

const SOUND_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

interface Props {
  control: Control<FieldValues>;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

export default function SoundStep({
  control,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
  return (
    <div className="wizard-step-container"> {/* THE ONE CARD FOR THIS STEP */}
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Sound Equipment</h2>
      <p className="text-lg text-gray-600 mb-6">Will sound equipment be needed for the performance?</p>

      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <fieldset className="flex flex-col gap-4"> {/* No visual border */}
            <legend className="sr-only">Is sound needed?</legend> {/* Visually hidden legend */}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> {/* Layout for options */}
              {SOUND_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={field.name + '-' + option.value}
                  className={clsx(
                    'flex items-center justify-center p-4 rounded-lg border transition-all duration-200 ease-in-out cursor-pointer',
                    'bg-white', /* Explicitly white background */
                    { 'border-brand-primary bg-brand-light-tint': field.value === option.value }, /* Selected state */
                    { 'border-gray-300 hover:border-gray-400': field.value !== option.value } /* Unselected state, hover */
                  )}
                >
                  <input
                    type="radio"
                    id={field.name + '-' + option.value}
                    name={field.name}
                    value={option.value}
                    checked={field.value === option.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="sr-only" /* Visually hidden native input */
                  />
                  <span className={clsx(
                    'text-lg font-semibold',
                    { 'text-brand-primary': field.value === option.value },
                    { 'text-gray-900': field.value !== option.value }
                  )}>
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      />

      {/* WizardNav is assumed to be rendered by a parent component that wraps the steps */}
      {/* If WizardNav is part of the scrollable content of this component, place it here */}
      {/* <WizardNav ... /> */}
    </div>
  );
}
