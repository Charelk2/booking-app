'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { becomeServiceProvider } from '@/lib/api';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

type FormValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  dob?: string;
  dob_day?: string;
  dob_month?: string;
  dob_year?: string;
};

export default function BecomeProviderModal({ isOpen, onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const defaults = useMemo(() => ({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    phone_number: user?.phone_number || '',
    dob: '',
    dob_day: '',
    dob_month: '',
    dob_year: '',
  }), [user]);

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors } } = useForm<FormValues>({ defaultValues: defaults });
  const dobDay = (watch('dob_day') || '').trim();
  const dobMonth = (watch('dob_month') || '').trim();
  const dobYear = (watch('dob_year') || '').trim();

  const months = useMemo(
    () => [
      { value: '1', label: 'Jan' },
      { value: '2', label: 'Feb' },
      { value: '3', label: 'Mar' },
      { value: '4', label: 'Apr' },
      { value: '5', label: 'May' },
      { value: '6', label: 'Jun' },
      { value: '7', label: 'Jul' },
      { value: '8', label: 'Aug' },
      { value: '9', label: 'Sep' },
      { value: '10', label: 'Oct' },
      { value: '11', label: 'Nov' },
      { value: '12', label: 'Dec' },
    ],
    [],
  );

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = 1900;
    const out: string[] = [];
    for (let y = currentYear; y >= startYear; y -= 1) out.push(String(y));
    return out;
  }, []);

  const daysInMonth = useMemo(() => {
    const m = Number(dobMonth);
    if (!Number.isFinite(m) || m < 1 || m > 12) return 31;
    const y = Number(dobYear) || 2000;
    return new Date(y, m, 0).getDate();
  }, [dobMonth, dobYear]);

  const dobIso = useMemo(() => {
    const y = Number(dobYear);
    const m = Number(dobMonth);
    const d = Number(dobDay);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '';
    if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return '';
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
    if (dt.getTime() > Date.now()) return '';
    const mm = String(m).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${String(y).padStart(4, '0')}-${mm}-${dd}`;
  }, [dobDay, dobMonth, dobYear]);

  useEffect(() => { reset(defaults); }, [defaults, reset]);

  useEffect(() => {
    setValue('dob', dobIso, { shouldDirty: true, shouldValidate: true });
  }, [dobIso, setValue]);

  useEffect(() => {
    if (!dobDay) return;
    const d = Number(dobDay);
    if (!Number.isFinite(d) || d < 1 || d > daysInMonth) {
      setValue('dob_day', '', { shouldDirty: true, shouldValidate: true });
    }
  }, [dobDay, daysInMonth, setValue]);

  const onSubmit = async (data: FormValues) => {
    setError('');
    setSubmitting(true);
    try {
      await becomeServiceProvider({
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone_number: (data.phone_number || '').trim() || undefined,
        dob: dobIso || undefined,
      });
      try { await refreshUser?.(); } catch {}
      onClose();
      router.replace('/dashboard/artist');
    } catch (e: any) {
      setError(e?.message || 'Could not upgrade your account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl">
                <Dialog.Title className="text-lg font-semibold">List your service</Dialog.Title>
                <p className="mt-1 text-sm text-gray-600">Confirm your details to create a service provider profile.</p>

                <form className="mt-4 space-y-3" onSubmit={handleSubmit(onSubmit)}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium">First name</label>
                      <input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('first_name', { required: 'Required' })} />
                      {errors.first_name && <p className="mt-1 text-xs text-red-600">{errors.first_name.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Last name</label>
                      <input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('last_name', { required: 'Required' })} />
                      {errors.last_name && <p className="mt-1 text-xs text-red-600">{errors.last_name.message}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Email</label>
                    <input type="email" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('email', { required: 'Required' })} />
                    {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Phone number</label>
                    <input className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('phone_number')} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="block text-sm font-medium">Date of birth (optional)</label>
                      {dobDay || dobMonth || dobYear ? (
                        <button
                          type="button"
                          className="text-xs text-gray-500 underline hover:text-gray-700"
                          onClick={() => {
                            setValue('dob_day', '', { shouldDirty: true, shouldValidate: true });
                            setValue('dob_month', '', { shouldDirty: true, shouldValidate: true });
                            setValue('dob_year', '', { shouldDirty: true, shouldValidate: true });
                            setValue('dob', '', { shouldDirty: true, shouldValidate: true });
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Choose month, day, and year (or leave blank).</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <label className="sr-only" htmlFor="bp_dob_month">Month</label>
                      <select
                        id="bp_dob_month"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        {...register('dob_month')}
                      >
                        <option value="">Month</option>
                        {months.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>

                      <label className="sr-only" htmlFor="bp_dob_day">Day</label>
                      <select
                        id="bp_dob_day"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        disabled={!dobMonth}
                        {...register('dob_day')}
                      >
                        <option value="">Day</option>
                        {Array.from({ length: daysInMonth }, (_, idx) => String(idx + 1)).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>

                      <label className="sr-only" htmlFor="bp_dob_year">Year</label>
                      <select
                        id="bp_dob_year"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        {...register('dob_year')}
                      >
                        <option value="">Year</option>
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="hidden"
                      {...register('dob', {
                        validate: () => {
                          const v = (getValues('dob') || '').trim();
                          const any = Boolean(dobDay || dobMonth || dobYear);
                          const all = Boolean(dobDay && dobMonth && dobYear);
                          if (!any) return true;
                          if (!all) return 'Please select month, day, and year.';
                          if (!v) return 'Please select a valid date.';
                          return true;
                        },
                      })}
                    />
                    {errors.dob && <p className="mt-1 text-xs text-red-600">{errors.dob.message}</p>}
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button type="button" className="rounded-md px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
                    <button type="submit" disabled={submitting} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                      {submitting ? 'Submitting…' : 'Confirm & Continue'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
