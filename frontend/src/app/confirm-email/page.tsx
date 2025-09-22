'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import Button from '@/components/ui/Button';
import { confirmEmail } from '@/lib/api';

export default function ConfirmEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'info'>('verifying');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setStatus('info');
      return;
    }
    confirmEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [params]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10 space-y-4 text-center">
        {status === 'verifying' && <p>Verifying...</p>}
        {status === 'info' && <p>Check your email for a verification link.</p>}
        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold">Email confirmed!</h1>
            <Button onClick={() => router.push('/auth?intent=login')}>Continue to Login</Button>
          </>
        )}
        {status === 'error' && <p className="text-red-600">Invalid or expired token.</p>}
      </div>
    </MainLayout>
  );
}

