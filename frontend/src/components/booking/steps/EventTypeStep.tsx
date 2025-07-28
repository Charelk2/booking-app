'use client';
import { Control, Controller } from 'react-hook-form';
import clsx from 'clsx';
import { EventDetails } from '@/contexts/BookingContext';

interface Props {
  control: Control<EventDetails>;
}

const options = [
  'Corporate',
  'Private',
  'Wedding',
  'Birthday',
  'Festival',
  'Restaurant',
  'Celebration',
  'Other',
];

export default function EventTypeStep({ control }: Props) {
  return (
    <div className="wizard-step-container">
      <Controller<EventDetails, 'eventType'>
        name="eventType"
        control={control}
        render={({ field }) => (
          <fieldset className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                <label htmlFor={`type-${opt}`} className={clsx('selectable-card')}>{opt}</label>
              </div>
            ))}
          </fieldset>
        )}
      />
    </div>
  );
}
