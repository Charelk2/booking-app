'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import MainLayout from '@/components/layout/MainLayout';
import AuthInput from '@/components/auth/AuthInput';
import Button from '@/components/ui/Button';
import { disableMfa } from '@/lib/api';

export default function Disable2faPage() {
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ code: string }>();
  const [success, setSuccess] = useState(false);

  const onSubmit = async ({ code }: { code: string }) => {
    setError('');
    try {
      await disableMfa(code);
      setSuccess(true);
    } catch (err) {
      setError('Invalid code');
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10 space-y-4">
        <h1 className="text-2xl font-bold">Disable Two-Factor Authentication</h1>
        {!success ? (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <AuthInput id="code" label="Current code" registration={register('code', { required: true })} />
            {error && <p className="text-red-600">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Disabling...' : 'Disable'}
            </Button>
          </form>
        ) : (
          <p className="text-green-700">Two-factor authentication disabled.</p>
        )}
      </div>
    </MainLayout>
  );
}
