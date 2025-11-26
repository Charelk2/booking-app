'use client';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type * as yup from 'yup';
import { EventDetails } from '@/contexts/BookingContext';
import type {
  Control,
  FieldErrors,
  UseFormHandleSubmit,
  UseFormSetValue,
  UseFormWatch,
  UseFormTrigger,
  UseFormReset,
} from 'react-hook-form';
import { useDebounce } from './useDebounce';


interface BookingFormHookReturn {
  control: Control<EventDetails>;
  handleSubmit: UseFormHandleSubmit<EventDetails>;
  trigger: UseFormTrigger<EventDetails>;
  setValue: UseFormSetValue<EventDetails>;
  watch: UseFormWatch<EventDetails>;
  reset: UseFormReset<EventDetails>;
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
    reset,
    formState: { errors, isValid },
  } = useForm<EventDetails>({
    defaultValues,
    resolver: yupResolver(schema),
    // Use onBlur to avoid validating on every keystroke; manual trigger is debounced below
    mode: 'onBlur',
  });

  // Debounce validation to reduce expensive schema checks while typing
  const watchedValues = watch();
  const debouncedValues = useDebounce(watchedValues, 300);

  useEffect(() => {
    void trigger();
  }, [debouncedValues, trigger]);

  useEffect(() => {
    const sub = watch((value) => {
      // Now, setDetails is simply called directly with the value,
      // as its type in this scope has been aligned by the hook's signature.
      setDetails(value as EventDetails);
    });
    return () => sub.unsubscribe();
  }, [watch, setDetails]);

  return {
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    reset,
    errors,
    isValid,
  };
}
