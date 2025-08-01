'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type * as yup from 'yup';
import { EventDetails } from '@/contexts/BookingContext';
import type { Control, FieldErrors, UseFormHandleSubmit, UseFormSetValue, UseFormWatch, UseFormTrigger } from 'react-hook-form';


interface BookingFormHookReturn {
  control: Control<EventDetails>;
  handleSubmit: UseFormHandleSubmit<EventDetails>;
  trigger: UseFormTrigger<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  watch: UseFormWatch<EventDetails>;
  errors: FieldErrors<EventDetails>;
  isValid: boolean;
}

export default function useBookingForm(
  schema: yup.ObjectSchema<EventDetails>,
  defaultValues: EventDetails,
  // CRITICAL FIX HERE: Modify the type of setDetails parameter in the hook.
  // This explicitly states the hook expects a function that takes EventDetails and returns void,
  // bypassing the complex Dispatch<SetStateAction<T>> inference issue.
  setDetails: (d: EventDetails) => void,
): BookingFormHookReturn {
  const {
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<EventDetails>({
    defaultValues,
    resolver: yupResolver(schema),
    mode: 'onChange',
  });

  useEffect(() => {
    const sub = watch((value) => {
      // Now, setDetails is simply called directly with the value,
      // as its type in this scope has been aligned by the hook's signature.
      setDetails(value as EventDetails);
    });
    return () => sub.unsubscribe();
  }, [watch, setDetails]);

  return { control, handleSubmit, trigger, watch, setValue, errors, isValid };
}