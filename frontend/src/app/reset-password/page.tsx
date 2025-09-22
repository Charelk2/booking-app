'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import AuthInput from '@/components/auth/AuthInput';
import Button from '@/components/ui/Button';
import { resetPassword } from '@/lib/api';

interface FormValues { password: string; confirmPassword: string }

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>();
  const [status, setStatus] = useState<'idle' | 'invalid' | 'success'>('idle');
  const [error, setError] = useState('');
  const password = watch('password');

  useEffect(() => {
    if (!token) setStatus('invalid');
  }, [token]);

  const onSubmit = async ({ password }: FormValues) => {
    if (!token) return;
    setError('');
    try {
      await resetPassword(token, password);
      setStatus('success');
      setTimeout(() => router.push('/auth?intent=login'), 1200);
    } catch (e) {
      setStatus('invalid');
      setError('Invalid or expired reset link.');
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10">
        <h1 className="text-2xl font-bold mb-6">Reset password</h1>
        {status === 'invalid' ? (
          <p className="text-red-600">Invalid or expired reset link.</p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <AuthInput
              id="password"
              type="password"
              label="New password"
              autoComplete="new-password"
              registration={register('password', { required: 'Password is required', minLength: { value: 6, message: 'At least 6 characters' } })}
              error={errors.password}
            />
            <AuthInput
              id="confirmPassword"
              type="password"
              label="Confirm new password"
              autoComplete="new-password"
              registration={register('confirmPassword', { required: 'Please confirm your password', validate: v => v === password || 'Passwords do not match' })}
              error={errors.confirmPassword}
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button type="submit" disabled={isSubmitting || status==='success'} className="w-full">
              {isSubmitting ? 'Saving...' : 'Save new password'}
            </Button>
            {status === 'success' && <p className="text-green-700 text-sm mt-2">Password updated. Redirecting…</p>}
          </form>
        )}
      </div>
    </MainLayout>
  );
}
