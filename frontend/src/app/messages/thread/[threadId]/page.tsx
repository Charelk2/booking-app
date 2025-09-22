'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';

export default function ThreadPageRedirect() {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const id = Number((params as { threadId?: string }).threadId);

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (id && !Number.isNaN(id)) {
          router.replace(`/inbox?requestId=${id}`);
        } else {
          router.replace('/inbox');
        }
      } else {
        router.replace(`/auth?intent=login&redirect=/messages/thread/${id}`);
      }
    }
  }, [id, router, user, loading]);

  if (loading || (user && id && !Number.isNaN(id))) {
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
          Please log in to view this conversation.
        </div>
      </MainLayout>
    );
  }

  return null;
}
