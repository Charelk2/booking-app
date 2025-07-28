'use client';
import { Control, Controller } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { EventDetails } from '@/contexts/BookingContext';

interface Props {
  control: Control<EventDetails>;
}

export default function EventDescriptionStep({ control }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="wizard-step-container">
      <Controller<EventDetails, 'eventDescription'>
        name="eventDescription"
        control={control}
        render={({ field }) => (
          <textarea
            rows={3}
            className="input-base"
            {...field}
            value={field.value || ''}
            autoFocus={!isMobile}
          />
        )}
      />
    </div>
  );
}
