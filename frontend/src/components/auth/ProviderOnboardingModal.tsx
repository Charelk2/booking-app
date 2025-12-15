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
  /** Optional: where to send the user after success. Defaults to /dashboard/artist. */
  next?: string;
  /** Optional: whether to render Set Password fields (only if you keep such flow). */
  showSetPassword?: boolean;
};

type FormValues = {
  phone_number: string;
  dob?: string;
  dob_day?: string;
  dob_month?: string;
  dob_year?: string;
  acceptProviderTerms: boolean;
  password?: string;
  confirmPassword?: string;
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

export default function ProviderOnboardingModal({ isOpen, onClose, next, showSetPassword = false }: Props) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const defaults = useMemo(() => ({
    phone_number: user?.phone_number || '',
    dob: '',
    dob_day: '',
    dob_month: '',
    dob_year: '',
    acceptProviderTerms: false,
  }), [user]);

  const { register, handleSubmit, reset, setValue, getValues, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: defaults });
  const password = watch('password') || '';
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

  const [error, setError] = useState('');

  useEffect(() => { reset(defaults); }, [defaults, reset]);

  useEffect(() => {
    setValue('dob', dobIso, { shouldDirty: true, shouldValidate: true });
  }, [dobIso, setValue]);

  const onSubmit = async (data: FormValues) => {
    setError('');
    try {
      if (!data.acceptProviderTerms) {
        setError('You must accept the provider terms to continue.');
        return;
      }
      // If implementing set password here later, ensure server supports it. We skip in this codebase.

      await becomeServiceProvider({
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        email: user?.email || '',
        phone_number: (data.phone_number || '').trim() || undefined,
        dob: dobIso || undefined,
      });
      try { await refreshUser?.(); } catch {}
      onClose();
      router.replace(next || '/dashboard/artist');
    } catch (e: any) {
      setError(e?.message || 'Could not start provider onboarding.');
    }
  };

  const mustProvidePhone = !user?.phone_number;
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
                <Dialog.Title className="text-lg font-semibold">Finish setting up your provider profile</Dialog.Title>
                <p className="mt-1 text-sm text-gray-600">We’ll use these details to prepare your provider dashboard.</p>

                <form className="mt-4 space-y-3" onSubmit={handleSubmit(onSubmit)}>
                  <div>
                    <label className="block text-sm font-medium">Phone number</label>
                    <input
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                      placeholder="+27 82 123 4567"
                      {...register('phone_number', {
                        required: mustProvidePhone ? 'Phone number is required' : false,
                        pattern: { value: /^\+?[0-9\s-]{10,}$/, message: 'Please enter a valid phone number' },
                      })}
                    />
                    {errors.phone_number && <p className="mt-1 text-xs text-red-600">{errors.phone_number.message}</p>}
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
                      <label className="sr-only" htmlFor="dob_day">Day</label>
                      <input
                        id="dob_day"
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

                      <label className="sr-only" htmlFor="dob_month">Month</label>
                      <div className="relative">
                        <input
                          id="dob_month"
                          autoComplete="bday-month"
                          placeholder="MM (or Jan)"
                          list="dob_months"
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
                        <datalist id="dob_months">
                          {months.map((m) => (
                            <option key={`m-${m.value}`} value={m.label} />
                          ))}
                          {months.map((m) => (
                            <option key={`n-${m.value}`} value={m.value} />
                          ))}
                        </datalist>
                      </div>

                      <label className="sr-only" htmlFor="dob_year">Year</label>
                      <div className="relative">
                        <input
                        id="dob_year"
                          inputMode="numeric"
                          autoComplete="bday-year"
                          placeholder="YYYY"
                          maxLength={4}
                          list="dob_years"
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
                        <datalist id="dob_years">
                          {years.map((y) => (
                            <option key={y} value={y} />
                          ))}
                        </datalist>
                      </div>
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

                  <div className="flex items-start gap-3">
                    <input id="acceptProviderTerms" type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" {...register('acceptProviderTerms', { required: 'Please accept the provider terms' })} />
                    <label htmlFor="acceptProviderTerms" className="text-sm text-gray-700">
                      I agree to the{' '}
                      <a href="/terms" className="underline text-black hover:text-black">
                        Provider Terms
                      </a>.
                    </label>
                  </div>
                  {errors.acceptProviderTerms && (
                    <p className="-mt-2 text-xs text-red-600">{errors.acceptProviderTerms.message}</p>
                  )}

                  {showSetPassword && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium">Set password</label>
                        <input type="password" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('password')} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium">Confirm password</label>
                        <input type="password" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('confirmPassword', { validate: (v) => v === password || 'Passwords do not match' })} />
                        {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
                      </div>
                    </div>
                  )}

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button type="button" className="rounded-md px-3 py-2 text-sm" onClick={onClose}>Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                      {isSubmitting ? 'Continuing…' : 'Continue to provider onboarding'}
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
