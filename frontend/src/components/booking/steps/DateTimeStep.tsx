'use client';
import { Controller, Control } from 'react-hook-form'; // REMOVED FieldValues
// WizardNav is REMOVED from here, as navigation is global now.
import ReactDatePicker from 'react-datepicker';
import '../../../styles/datepicker.css';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import useIsMobile from '@/hooks/useIsMobile';
import { DateInput } from '../../ui'; // Assuming DateInput is imported

// Import EventDetails for correct Control typing
import { EventDetails } from '@/contexts/BookingContext';

// Props interface SIMPLIFIED: No navigation props here.
interface Props {
  control: Control<EventDetails>; // Type control with EventDetails
  unavailable: string[];
  loading?: boolean;
  // No step, steps, onBack, onSaveDraft, onNext props here.
}

export default function DateTimeStep({
  control,
  unavailable,
  loading = false,
}: Props) {
  const isMobile = useIsMobile();
  const filterDate = (date: Date) => {
    const day = format(date, 'yyyy-MM-dd');
    const today = startOfDay(new Date());
    return !unavailable.includes(day) && !isBefore(date, today);
  };
  return (
    <div className="wizard-step-container">
      {loading ? (
        <div
          data-testid="calendar-skeleton"
          className="h-72 bg-gray-200 rounded animate-pulse"
        />
      ) : (
        <Controller<EventDetails, 'date'>
          name="date"
          control={control}
          render={({ field }) => {
            const currentValue =
              field.value && typeof field.value === 'string'
                ? parseISO(field.value)
                : (field.value as Date | null | undefined);
            return isMobile ? (
              <DateInput
                min={format(new Date(), 'yyyy-MM-dd')}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={currentValue ? format(currentValue, 'yyyy-MM-dd') : ''}
                onChange={(e) => field.onChange(e.target.value)}
                inputClassName="input-base"
              />
            ) : (
              <div className="mx-auto w-fit border border-gray-200 rounded-lg hover:shadow-lg">
                <ReactDatePicker
                  {...field}
                  selected={currentValue}
                  inline
                  locale={enUS}
                  filterDate={filterDate}
                  minDate={startOfDay(new Date())}
                  onChange={(date: Date | null) => field.onChange(date)}
                  renderCustomHeader={({
                    date,
                    decreaseMonth,
                    increaseMonth,
                    prevMonthButtonDisabled,
                    nextMonthButtonDisabled,
                  }) => (
                    <div className="flex justify-between items-center px-3 pt-2 pb-2">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          decreaseMonth();
                        }}
                        disabled={prevMonthButtonDisabled}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <ChevronLeftIcon className="h-5 w-5 text-gray-500" />
                      </button>
                      <span className="text-base font-semibold text-gray-900">
                        {date.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          increaseMonth();
                        }}
                        disabled={nextMonthButtonDisabled}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                      </button>
                    </div>
                  )}
                />
              </div>
            );
          }}
        />
      )}
      {/* No WizardNav here. Its buttons are now in the parent BookingWizard. */}
    </div>
  );
}