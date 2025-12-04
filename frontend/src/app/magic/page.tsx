'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { consumeMagicLink } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function MagicConsumePage() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Missing magic token.');
      return;
    }
    (async () => {
      try {
        const res = await consumeMagicLink(token);
        // Refresh AuthContext user from the server (cookies just set by backend)
        if (refreshUser) {
          await refreshUser();
        }
        const next = (res.data && (res.data as any).next) || '/dashboard';
        router.replace(next);
      } catch (e) {
        setError('Invalid or expired magic link.');
      }
    })();
  }, [params, router, refreshUser]);

  return (
    <MainLayout>
      <div className="mx-auto max-w-lg py-10 text-center">
        {!error ? <p>Signing you in…</p> : <p className="text-red-600">{error}</p>}
      </div>
    </MainLayout>
  );
}
