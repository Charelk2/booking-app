'use client';
import { Control, Controller } from 'react-hook-form';

// Import EventDetails if your actual WizardNav uses it for deeper checks
import { EventDetails } from '@/contexts/BookingContext'; // Added EventDetails

interface Props {
  control: Control<EventDetails>;
}

export default function SoundStep({
  control,
}: Props) {
  return (
    <div className="wizard-step-container">
      <Controller<EventDetails, 'sound'> // Explicitly type Controller
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

    </div>
  );
}