'use client';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';

export default function BookingPage() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const artistId = Number(params.get('artist_id') || 0);
  const serviceIdParam = params.get('service_id');
  const serviceId = serviceIdParam ? Number(serviceIdParam) : undefined;
  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen">
          <p>Loading...</p>
        </div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-screen text-center space-y-4 flex-col">
          <p>You must log in to create a booking.</p>
          <Link href="/login" className="text-indigo-600 underline">
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
          <BookingWizard artistId={artistId} serviceId={serviceId} />
        </BookingProvider>
      </div>
    </MainLayout>
  );
}
