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
  acceptProviderTerms: boolean;
  password?: string;
  confirmPassword?: string;
};

export default function ProviderOnboardingModal({ isOpen, onClose, next, showSetPassword = false }: Props) {
  const { user, refreshUser } = useAuth();
  const router = useRouter();

  const defaults = useMemo(() => ({
    phone_number: user?.phone_number || '',
    dob: '',
    acceptProviderTerms: false,
  }), [user]);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ defaultValues: defaults });
  const password = watch('password') || '';

  const [error, setError] = useState('');

  useEffect(() => { reset(defaults); }, [defaults, reset]);

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
        dob: data.dob || undefined,
      });
      try { await refreshUser?.(); } catch {}
      onClose();
      router.replace(next || '/dashboard/artist');
    } catch (e: any) {
      setError(e?.message || 'Could not start provider onboarding.');
    }
  };

  const mustProvidePhone = !user?.phone_number;

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
                    <label className="block text-sm font-medium">Date of birth (optional)</label>
                    <input type="date" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('dob')} />
                  </div>

                  <div className="flex items-start gap-3">
                    <input id="acceptProviderTerms" type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" {...register('acceptProviderTerms', { required: 'Please accept the provider terms' })} />
                    <label htmlFor="acceptProviderTerms" className="text-sm text-gray-700">
                      I agree to the <a href="/terms" className="underline">Provider Terms</a>.
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

