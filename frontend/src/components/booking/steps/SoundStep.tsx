'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';
import { Button } from '../../ui';
import WizardNav from '../WizardNav';

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
          <fieldset className="space-y-2">
            <legend className="font-medium">Is sound needed?</legend>
            <label className="flex items-center space-x-2 py-2">
              <input
                type="radio"
                name={field.name}
                value="yes"
                checked={field.value === 'yes'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>Yes</span>
            </label>
            <label className="flex items-center space-x-2 py-2">
              <input
                type="radio"
                name={field.name}
                value="no"
                checked={field.value === 'no'}
                onChange={(e) => field.onChange(e.target.value)}
              />
              <span>No</span>
            </label>
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
