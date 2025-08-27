'use client';
// Larger touch targets and contextual help improve usability on mobile.
import { Controller, Control } from 'react-hook-form';
import useIsMobile from '@/hooks/useIsMobile';
import { TextInput } from '../../ui';
import { EventDetails } from '@/contexts/BookingContext';

interface Props {
  control: Control<EventDetails>;
  open?: boolean;
  onToggle?: () => void;
}

export default function GuestsStep({ control, open = true, onToggle = () => {} }: Props) {
  const isMobile = useIsMobile();

  return (
    <section className="wizard-step-container rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-bold text-neutral-900">Guests</h3>
        <p className="text-sm font-normal text-gray-600 pt-1">How many people?</p>
      </div>
      <div className="mt-6">
      <Controller // Explicitly type Controller
        name="guests"
        control={control}
        render={({ field }) => {
          const val = parseInt(field.value || '0', 10) || 0;
          const set = (n: number) => field.onChange(String(Math.max(1, n)));
          return (
            <div className="flex items-center gap-2 max-w-xs">
              <button
                type="button"
                aria-label="Decrease guests"
                className="rounded-xl border border-black/20 bg-white px-3 py-2 text-lg"
                onClick={() => set(val - 1)}
              >
                −
              </button>
              <TextInput
                type="number"
                min={1}
                {...field}
                value={field.value ? String(field.value) : ''}
                autoFocus={!isMobile}
                className="input-base text-lg rounded-xl bg-white border border-black/20 placeholder:text-neutral-400 focus:border-black px-3 py-2 text-center"
              />
              <button
                type="button"
                aria-label="Increase guests"
                className="rounded-xl border border-black/20 bg-white px-3 py-2 text-lg"
                onClick={() => set(val + 1)}
              >
                +
              </button>
            </div>
          );
        }}
      />
      </div>
    </section>
  );
}
