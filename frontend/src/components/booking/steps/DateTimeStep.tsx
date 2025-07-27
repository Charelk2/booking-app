'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import WizardNav from '../WizardNav';
import ReactDatePicker from 'react-datepicker';
import '../../styles/datepicker.css';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { format, parseISO } from 'date-fns';
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
  const filterDate = (date: Date) => {
    const day = format(date, 'yyyy-MM-dd');
    return !unavailable.includes(day) && date >= new Date();
  };
  return (
    <div className="wizard-step-container">
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
                inputClassName="input-base"
              />
            ) : (
              <div className="mx-auto w-fit border border-gray-200 rounded-lg hover:shadow-lg">
                <ReactDatePicker
                  {...field}
                  selected={currentValue}
                  inline
                  locale="en-US"
                  filterDate={filterDate}
                  onChange={(date) => field.onChange(date as Date)}
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
