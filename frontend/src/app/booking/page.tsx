'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui';

export default function BookingPage() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const artistId = Number(params.get('artist_id') || 0);
  const serviceIdParam = params.get('service_id');
  const serviceId = serviceIdParam ? Number(serviceIdParam) : undefined;
  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    const here = typeof window === 'undefined' ? '/booking' : `${window.location.pathname}${window.location.search}`;
    const onClickLogin = (e: React.MouseEvent) => {
      e.preventDefault();
      router.push(`/auth?intent=login&next=${encodeURIComponent(here)}`);
    };
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen text-center space-y-4 flex-col">
          <p>You must log in to create a booking.</p>
          <Link href="/auth?intent=login" onClick={onClickLogin} className="text-brand-dark underline">
            Login
          </Link>
        </div>
      </MainLayout>
    );
  }
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4">
        <BookingProvider>
          <BookingWizard
            artistId={artistId}
            serviceId={serviceId}
            isOpen
            onClose={() => router.back()}
          />
        </BookingProvider>
      </div>
    </MainLayout>
  );
}
