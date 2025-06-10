'use client';
import { Controller, Control, FieldValues } from 'react-hook-form';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format } from 'date-fns';
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
        render={({ field }) => (
          isMobile ? (
            <input
              type="date"
              className="border p-2 rounded w-full"
              min={format(new Date(), 'yyyy-MM-dd')}
              {...field}
            />
          ) : (
            <Calendar
              {...field}
              locale="en-US"
              formatLongDate={formatLongDate}
              onChange={field.onChange}
              tileDisabled={tileDisabled}
            />
          )
        )}
      />
    </div>
  );
}
