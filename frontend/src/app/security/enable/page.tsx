'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import MainLayout from '@/components/layout/MainLayout';
import AuthInput from '@/components/auth/AuthInput';
import Button from '@/components/ui/Button';
import { setupMfa, confirmMfa, generateRecoveryCodes } from '@/lib/api';

export default function Enable2faPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpUrl, setOtpUrl] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ code: string }>();

  const handleSetup = async () => {
    setError('');
    try {
      const res = await setupMfa();
      setSecret(res.data.secret);
      setOtpUrl(res.data.otp_auth_url);
    } catch (err) {
      setError('Failed to start MFA setup');
    }
  };

  const onSubmit = async ({ code }: { code: string }) => {
    if (!secret) return;
    setError('');
    try {
      await confirmMfa(code);
      const res = await generateRecoveryCodes();
      setCodes(res.data.codes ?? res);
    } catch (err) {
      setError('Invalid verification code');
    }
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10 space-y-4">
        <h1 className="text-2xl font-bold">Enable Two-Factor Authentication</h1>
        {!secret && (
          <Button onClick={handleSetup}>Start setup</Button>
        )}
        {secret && (
          <div className="space-y-4">
            <p>Secret: <code>{secret}</code></p>
            {otpUrl && (
              <p className="break-all">OTP URL: {otpUrl}</p>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <AuthInput id="code" label="Verification code" registration={register('code', { required: true })} />
              {error && <p className="text-red-600">{error}</p>}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </Button>
            </form>
          </div>
        )}
        {codes.length > 0 && (
          <div>
            <h2 className="font-medium">Recovery Codes</h2>
            <ul className="list-disc pl-4 text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
