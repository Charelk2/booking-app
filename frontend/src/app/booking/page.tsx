'use client';
import { useSearchParams } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import BookingWizard from '@/components/booking/BookingWizard';
import { BookingProvider } from '@/contexts/BookingContext';

export default function BookingPage() {
  const params = useSearchParams();
  const artistId = Number(params.get('artist_id') || 0);
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4">
        <BookingProvider>
          <BookingWizard artistId={artistId} />
        </BookingProvider>
      </div>
    </MainLayout>
  );
}
