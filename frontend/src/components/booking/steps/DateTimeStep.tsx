'use client';

import { Controller, Control, FieldValues } from 'react-hook-form';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css'; // Keep the external CSS for the calendar's structure
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import useIsMobile from '@/hooks/useIsMobile';
import { DateInput } from '../../ui'; // Assuming this provides a native date input for mobile

interface Props {
  control: Control<FieldValues>;
  unavailable: string[];
  loading?: boolean;
  step: number;
  steps: string[];
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
}

export default function DateTimeStep({
  control,
  unavailable,
  loading = false,
  step,
  steps,
  onBack,
  onSaveDraft,
  onNext,
}: Props) {
  const isMobile = useIsMobile();

  const tileDisabled = ({ date }: { date: Date }) => {
    const day = format(date, 'yyyy-MM-dd');
    return unavailable.includes(day) || date < new Date();
  };

  const formatLongDate = (_locale: string | undefined, date: Date) =>
    format(date, 'MMMM d, yyyy', { locale: enUS });

  return (
    <div className="wizard-step-container"> {/* THE ONE CARD FOR THIS STEP */}
      <h2 className="step-title">Event Date & Time</h2>
      <p className="step-description">When should we perform?</p>

      {loading ? (
        <div
          data-testid="calendar-skeleton"
          className="w-full h-72 bg-gray-200 rounded-lg animate-pulse" // Simple skeleton styling
        />
      ) : (
        <Controller
          name="date"
          control={control}
          render={({ field }) => {
            const currentValue =
              field.value && typeof field.value === 'string'
                ? parseISO(field.value)
                : field.value;

            return isMobile ? (
              <DateInput
                min={format(new Date(), 'yyyy-MM-dd')}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={currentValue ? format(currentValue, 'yyyy-MM-dd') : ''}
                onChange={(e) => field.onChange(e.target.value)}
                inputClassName="input-field" /* Apply input-field styling */
                placeholder="Select a date"
              />
            ) : (
              <div className="mx-auto w-fit border border-gray-300 rounded-lg shadow-sm overflow-hidden"> {/* Container for desktop calendar */}
                <Calendar
                  {...field}
                  value={currentValue}
                  locale="en-US"
                  formatLongDate={formatLongDate}
                  onChange={(date) => field.onChange(date as Date)}
                  tileDisabled={tileDisabled}
                  // React-Calendar has its own CSS. Ensure it's not overriding primary colors too much.
                  // You might need to scope/override its specific internal classes if needed in globals.css.
                />
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
