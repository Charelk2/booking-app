'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type * as yup from 'yup';
import { EventDetails } from '@/contexts/BookingContext';

export default function useBookingForm(
  schema: yup.ObjectSchema<EventDetails>,
  defaultValues: EventDetails,
  setDetails: (d: EventDetails) => void,
) {
  const {
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EventDetails>({
    defaultValues,
    resolver: yupResolver(schema),
    mode: 'onChange',
  });

  useEffect(() => {
    const sub = watch((v) => setDetails(v as EventDetails));
    return () => sub.unsubscribe();
  }, [watch, setDetails]);

  return { control, handleSubmit, trigger, watch, setValue, errors };
}
