'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import useIsMobile from '@/hooks/useIsMobile';

interface Props {
  control: Control<FieldValues>;
  unavailable: string[];
}

export default function DateTimeStep({ control, unavailable }: Props) {
  const isMobile = useIsMobile();
  const tileDisabled = ({ date }: { date: Date }) => {
    const day = format(date, 'yyyy-MM-dd');
    return unavailable.includes(day) || date < new Date();
  };
  const formatLongDate = (_locale: string | undefined, date: Date) =>
    format(date, 'MMMM d, yyyy', { locale: enUS });
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">When should we perform?</p>
      <Controller
        name="date"
        control={control}
        render={({ field }) => {
          const currentValue =
            field.value && typeof field.value === 'string'
              ? parseISO(field.value)
              : field.value;
          return isMobile ? (
            <input
              type="date"
              className="border p-2 rounded w-full"
              min={format(new Date(), 'yyyy-MM-dd')}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={currentValue ? format(currentValue, 'yyyy-MM-dd') : ''}
              onChange={(e) => field.onChange(e.target.value)}
            />
          ) : (
            <Calendar
              {...field}
              value={currentValue}
              locale="en-US"
              formatLongDate={formatLongDate}
              onChange={(date) => field.onChange(date as Date)}
              tileDisabled={tileDisabled}
            />
          );
        }}
      />
    </div>
  );
}
