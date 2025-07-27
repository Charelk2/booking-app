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
    <div className="wizard-step-container">
      <Controller
        name="sound"
        control={control}
        render={({ field }) => (
          <fieldset className="space-y-2">
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
