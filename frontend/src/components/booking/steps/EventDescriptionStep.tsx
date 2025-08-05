'use client';
import { Control, Controller } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { EventDetails } from '@/contexts/BookingContext';
import { CollapsibleSection } from '../../ui';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function EventDescriptionStep({ control, open = true, onToggle = () => {} }: Props) {
  const isMobile = useIsMobile();
  return (
    <CollapsibleSection
      title="Event Details"
      open={open}
      onToggle={onToggle}
      className="wizard-step-container"
    >
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
    </CollapsibleSection>
  );
}
