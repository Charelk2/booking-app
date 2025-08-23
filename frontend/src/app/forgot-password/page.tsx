'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import MainLayout from '@/components/layout/MainLayout';
import AuthInput from '@/components/auth/AuthInput';
import Button from '@/components/ui/Button';
import { forgotPassword } from '@/lib/api';

interface FormValues { email: string }

export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>();
  const [status, setStatus] = useState<'idle' | 'sent'>('idle');
  const [error, setError] = useState('');

  const onSubmit = async ({ email }: FormValues) => {
    setError('');
    try {
      await forgotPassword(email);
      setStatus('sent');
    } catch (e) {
      setError('Unable to send reset link. Please try again.');
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-sm py-10">
        <h1 className="text-2xl font-bold mb-6">Forgot password</h1>
        {status === 'sent' ? (
          <p>Check your email for a password reset link.</p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <AuthInput
              id="email"
              type="email"
              label="Email address"
              autoComplete="email"
              registration={register('email', { required: 'Email is required' })}
              error={errors.email}
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        )}
      </div>
    </MainLayout>
  );
}

