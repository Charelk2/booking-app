'use client';
import { Control, Controller, FieldValues } from 'react-hook-form';
import { Button, SelectableCard } from '../../ui';
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
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="font-medium col-span-2 mb-2">Is sound needed?</legend>
            <SelectableCard
              name={field.name}
              value="yes"
              label="Yes"
              checked={field.value === 'yes'}
              onChange={(e) => field.onChange(e.target.value)}
            />
            <SelectableCard
              name={field.name}
              value="no"
              label="No"
              checked={field.value === 'no'}
              onChange={(e) => field.onChange(e.target.value)}
            />
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
