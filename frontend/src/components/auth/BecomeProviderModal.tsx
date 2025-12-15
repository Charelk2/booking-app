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

type DobParts = {
  day: string;
  month: string;
  year: string;
};

function parseMonthInput(raw: string): number | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;

  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;

  const key = s.replace(/[^a-z]/g, '');
  const map: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return map[key] || null;
}

function tryParseDobInput(raw: string): DobParts | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (m) return { year: m[1], month: m[2], day: m[3] };

  m = s.match(/^(\d{1,2})[./-](\d{1,2}|[A-Za-z]{3,9})[./-](\d{4})$/);
  if (m) return { day: m[1], month: m[2], year: m[3] };

  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) return { day: m[1], month: m[2], year: m[3] };

  return null;
}

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

  // Note: we intentionally avoid <datalist> here to keep the DOB inputs minimal
  // (no dropdown arrows) while still allowing free typing + paste parsing.

  const dobIso = useMemo(() => {
    const y = Number(dobYear);
    const m = parseMonthInput(dobMonth);
    const d = Number(dobDay);
    if (!Number.isFinite(y) || !Number.isFinite(d) || !m) return '';
    if (y < 1900 || d < 1 || d > 31) return '';
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

  const dobDayReg = register('dob_day');
  const dobMonthReg = register('dob_month');
  const dobYearReg = register('dob_year');

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
                    <p className="mt-1 text-xs text-gray-500">Enter day, month, and year (DD/MM/YYYY) — or leave blank.</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <label className="sr-only" htmlFor="bp_dob_day">Day</label>
                      <input
                        id="bp_dob_day"
                        inputMode="numeric"
                        autoComplete="bday-day"
                        placeholder="DD"
                        maxLength={2}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        {...dobDayReg}
                        onChange={(e) => {
                          const parsed = tryParseDobInput(e.target.value);
                          if (parsed) {
                            setValue('dob_day', parsed.day, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_month', parsed.month, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_year', parsed.year, { shouldDirty: true, shouldValidate: true });
                            return;
                          }
                          dobDayReg.onChange(e);
                        }}
                      />

                      <label className="sr-only" htmlFor="bp_dob_month">Month</label>
                      <input
                        id="bp_dob_month"
                        autoComplete="bday-month"
                        placeholder="MM"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        {...dobMonthReg}
                        onChange={(e) => {
                          const parsed = tryParseDobInput(e.target.value);
                          if (parsed) {
                            setValue('dob_day', parsed.day, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_month', parsed.month, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_year', parsed.year, { shouldDirty: true, shouldValidate: true });
                            return;
                          }
                          dobMonthReg.onChange(e);
                        }}
                      />

                      <label className="sr-only" htmlFor="bp_dob_year">Year</label>
                      <input
                        id="bp_dob_year"
                        inputMode="numeric"
                        autoComplete="bday-year"
                        placeholder="YYYY"
                        maxLength={4}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                        {...dobYearReg}
                        onChange={(e) => {
                          const parsed = tryParseDobInput(e.target.value);
                          if (parsed) {
                            setValue('dob_day', parsed.day, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_month', parsed.month, { shouldDirty: true, shouldValidate: true });
                            setValue('dob_year', parsed.year, { shouldDirty: true, shouldValidate: true });
                            return;
                          }
                          dobYearReg.onChange(e);
                        }}
                      />
                    </div>
                    <input
                      type="hidden"
                      {...register('dob', {
                        validate: () => {
                          const v = (getValues('dob') || '').trim();
                          const any = Boolean(dobDay || dobMonth || dobYear);
                          const all = Boolean(dobDay && dobMonth && dobYear);
                          if (!any) return true;
                          if (!all) return 'Please enter day, month, and year.';
                          if (!v) return 'Please enter a valid date.';
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
