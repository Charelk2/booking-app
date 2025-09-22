'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function BookingRequestRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const id = Number(params.id);

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        if (id && !Number.isNaN(id)) {
          router.replace(`/inbox?requestId=${id}`);
        } else {
          router.replace('/inbox');
        }
      } else {
        router.replace(`/auth?intent=login&redirect=/booking-requests/${id}`);
      }
    }
  }, [id, router, user, authLoading]);

  if (authLoading || (user && id && !Number.isNaN(id))) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
          <p className="ml-2">Redirecting to messages...</p>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8 text-center">
          Please log in to view this request.
          <p className="mt-2 text-sm text-gray-500">You will be redirected.</p>
        </div>
      </MainLayout>
    );
  }

  return null;
}
