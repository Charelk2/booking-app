'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import toast from '@/components/ui/Toast';
import {
  getMyArtistBookings,
  updateBookingStatus,
  downloadBookingIcs,
} from '@/lib/api';
import { Booking } from '@/types';
import { formatCurrency, formatStatus } from '@/lib/utils';
import { Spinner } from '@/components/ui';

export default function ArtistBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleStatusChange = async (
    id: number,
    status: Booking['status'],
  ) => {
    try {
      const res = await updateBookingStatus(id, status);
      setBookings((prev) =>
        prev.map((bk) => (bk.id === id ? res.data : bk)),
      );
      toast.success('Booking updated');
    } catch (err) {
      console.error('Status update error', err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to update booking',
      );
    }
  };

  const handleDownload = async (id: number) => {
    try {
      const res = await downloadBookingIcs(id);
      const blob = new Blob([res.data], { type: 'text/calendar' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `booking-${id}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Calendar download error', err);
      toast.error(
        err instanceof Error ? err.message : 'Failed to download calendar',
      );
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchBookings = async () => {
      try {
        const res = await getMyArtistBookings();
        setBookings(res.data);
      } catch (err) {
        console.error('Failed to load bookings', err);
        setError('Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    if (user.user_type === 'artist') {
      fetchBookings();
    } else {
      setLoading(false);
      setError('Access denied');
    }
  }, [user]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">
          Please{' '}
          <Link
            href="/login"
            className="text-brand-dark no-underline hover:no-underline"
          >
            log in
          </Link>{' '}
          to view your bookings.
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Spinner />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-8 text-red-600">{error}</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-semibold">All Bookings</h1>
        {bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : (
          <ul className="space-y-3">
            {bookings.map((b) => (
              <li key={b.id} className="bg-white p-4 shadow rounded-lg">
                <div className="font-medium text-gray-900">
                  {b.client?.first_name || 'Unknown'} {b.client?.last_name || ''}
                </div>
                <div className="text-sm text-gray-500">{b.service?.title || '—'}</div>
                <div className="text-sm text-gray-500">
                  {format(new Date(b.start_time), 'MMM d, yyyy h:mm a')}
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <span
                    className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                      b.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : b.status === 'cancelled'
                        ? 'bg-red-100 text-red-800'
                        : b.status === 'confirmed'
                        ? 'bg-brand-light text-brand-dark'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {formatStatus(b.status)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatCurrency(Number(b.total_price))}
                  </span>
                </div>
                {b.source_quote && (
                  <Link
                    href={`/quotes/${b.source_quote.id}`}
                    className="text-brand-dark hover:underline text-sm mt-1 inline-block"
                  >
                    View Quote
                  </Link>
                )}
                <div className="mt-2 space-x-4">
                  {b.status !== 'completed' && b.status !== 'cancelled' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(b.id, 'completed')}
                        className="text-green-600 hover:underline text-sm"
                      >
                        Mark Completed
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(b.id, 'cancelled')}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Cancel Booking
                      </button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => handleDownload(b.id)}
                      className="text-brand-dark hover:underline text-sm"
                    >
                      Add to Calendar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MainLayout>
  );
}
