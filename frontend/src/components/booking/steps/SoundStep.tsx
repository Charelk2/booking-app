'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';
import WizardNav from '../WizardNav';
import clsx from 'clsx';

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
    <div className="space-y-4">
      <p className="text-sm text-gray-600">Will sound equipment be needed?</p>
      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <fieldset className="space-y-4">
            <legend className="font-medium sr-only">Is sound needed?</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {SOUND_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  htmlFor={field.name + '-' + option.value}
                  className={clsx(
                    'block cursor-pointer border rounded-lg p-4 transition-all duration-200 ease-in-out',
                    'hover:border-gray-400 hover:shadow-sm',
                    {
                      'border-brand bg-brand-light': field.value === option.value,
                      'border-gray-200 bg-white': field.value !== option.value,
                    },
                  )}
                >
                  <input
                    type="radio"
                    id={field.name + '-' + option.value}
                    name={field.name}
                    value={option.value}
                    checked={field.value === option.value}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                    }}
                    className="sr-only"
                  />
                  <span
                    className={clsx('font-medium text-lg', {
                      'text-brand': field.value === option.value,
                      'text-gray-900': field.value !== option.value,
                    })}
                  >
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
