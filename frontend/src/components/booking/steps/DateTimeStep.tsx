'use client';
import { Controller, Control, UseFormWatch, FieldValues } from 'react-hook-form';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';

interface Props {
  control: Control<FieldValues>;
  unavailable: string[];
  watch: UseFormWatch<FieldValues>;
}

export default function DateTimeStep({ control, unavailable, watch }: Props) {
  const tileDisabled = ({ date }: { date: Date }) => {
    const day = format(date, 'yyyy-MM-dd');
    return unavailable.includes(day) || date < new Date();
  };
  const formatLongDate = (_locale: string | undefined, date: Date) =>
    format(date, 'MMMM d, yyyy', { locale: enUS });
  return (
    <div className="space-y-4">
      <Controller
        name="date"
        control={control}
        render={({ field }) => (
          <Calendar
            {...field}
            locale="en-US"
            formatLongDate={formatLongDate}
            onChange={field.onChange}
            tileDisabled={tileDisabled}
          />
        )}
      />
      {watch('date') && (
        <Controller
          name="time"
          control={control}
          render={({ field }) => (
            <input type="time" className="border p-2 rounded w-full" {...field} />
          )}
        />
      )}
    </div>
  );
}
