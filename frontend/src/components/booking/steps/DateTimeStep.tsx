'use client';
import { useState, useEffect } from 'react';
import { Controller, Control } from 'react-hook-form'; // REMOVED FieldValues
// WizardNav is REMOVED from here, as navigation is global now.
import dynamic from 'next/dynamic';
import '../../../styles/datepicker.css';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import useIsMobile from '@/hooks/useIsMobile';
import { DateInput } from '../../ui';

// Import EventDetails for correct Control typing
import { EventDetails } from '@/contexts/BookingContext';

const ReactDatePicker: any = dynamic(() => import('react-datepicker'), { ssr: false });

// Props interface SIMPLIFIED: No navigation props here.
interface Props {
  control: Control<EventDetails>; // Type control with EventDetails
  unavailable: string[];
  loading?: boolean;
  open?: boolean;
  onToggle?: () => void;
}

export default function DateTimeStep(props: Props) {
  const {
    control,
    unavailable,
    loading = false,
    open = true,
    onToggle = () => {},
  } = props;
  const isMobile = useIsMobile();
  const [showPicker, setShowPicker] = useState(false);
  useEffect(() => {
    if (open && !isMobile) setShowPicker(true);
  }, [open, isMobile]);
  const filterDate = (date: Date) => {
    const day = format(date, 'yyyy-MM-dd');
    const today = startOfDay(new Date());
    return !unavailable.includes(day) && !isBefore(date, today);
  };
  return (
    <section className="wizard-step-container wizard-step-container-date booking-wizard-step">
      <div>
        <h3 className="font-bold text-neutral-900">Date & Time</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">When should we perform?</p>
      </div>
      <div className="mt-6">
      {loading || (!isMobile && !showPicker) ? (
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
                : (field.value as Date | null | undefined);
            return isMobile ? (
              <>
                <DateInput
                  min={format(new Date(), 'yyyy-MM-dd')}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={currentValue ? format(currentValue, 'yyyy-MM-dd') : ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  inputClassName="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
                />
                {!currentValue && (
                  <p className="text-xs text-neutral-500 mt-1">Choose a date to continue.</p>
                )}
              </>
            ) : (
              <div className="mx-auto w-fit booking-wizard-datepicker">
                <ReactDatePicker
                  {...field}
                  selected={currentValue}
                  inline
                  locale={enUS}
                  filterDate={filterDate}
                  minDate={startOfDay(new Date())}
                  onChange={(date: Date | null) => field.onChange(date)}
                  onClickOutside={() => {}}
                  renderCustomHeader={(hdrProps) => {
                    const {
                      date,
                      decreaseMonth,
                      increaseMonth,
                      prevMonthButtonDisabled,
                      nextMonthButtonDisabled,
                    } = hdrProps as any;
                    return (
                      <div className="flex justify-between items-center px-3 pt-2 pb-2">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            decreaseMonth();
                          }}
                          disabled={prevMonthButtonDisabled}
                          aria-label="Previous month"
                          className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
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
                          aria-label="Next month"
                          className="p-2.5 rounded-full hover:bg-gray-100 active:bg-gray-200"
                        >
                          <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                        </button>
                      </div>
                    );
                  }}
                />
              </div>
            );
          }}
        />

      )}
      {/* Time input (optional) */}
      <div className="mt-4 max-w-sm">
        <label className="block text-sm font-medium text-neutral-900 mb-1">Start time (optional)</label>
        <Controller
          name="time"
          control={control}
          render={({ field }) => (
            <input
              type="time"
              {...field}
              value={field.value || ''}
              className="input-base rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2"
            />
          )}
        />
      </div>
      </div>
    </section>
  );
}
