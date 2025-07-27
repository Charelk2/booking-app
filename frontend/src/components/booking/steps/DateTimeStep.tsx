'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import useIsMobile from '@/hooks/useIsMobile';
import { DateInput } from '../../ui';

interface Props {
  control: Control<FieldValues>;
  unavailable: string[];
  /** Show a skeleton calendar while availability loads */
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
    <div className="wizard-step-container">
      <h2 className="text-3xl font-bold text-gray-900 mb-2">Event Date & Time</h2>
      <p className="text-lg text-gray-600 mb-6">When should we perform?</p>
      {loading ? (
        <div
          data-testid="calendar-skeleton"
          className="h-72 bg-gray-200 rounded animate-pulse"
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
                inputClassName="w-full p-4 rounded-lg border border-gray-300 text-lg text-gray-900 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all duration-200 ease-in-out"
              />
            ) : (
              <div className="mx-auto w-fit border border-gray-200 rounded-lg hover:shadow-lg">
                <Calendar
                  {...field}
                  value={currentValue}
                  locale="en-US"
                  formatLongDate={formatLongDate}
                  onChange={(date) => field.onChange(date as Date)}
                  tileDisabled={tileDisabled}
                />
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
