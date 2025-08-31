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
  }), [user]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: defaults });

  useEffect(() => { reset(defaults); }, [defaults, reset]);

  const onSubmit = async (data: FormValues) => {
    setError('');
    setSubmitting(true);
    try {
      await becomeServiceProvider({
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone_number: (data.phone_number || '').trim() || undefined,
        dob: data.dob || undefined,
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
                    <label className="block text-sm font-medium">Date of birth</label>
                    <input type="date" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" {...register('dob')} />
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

