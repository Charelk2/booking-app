'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { getMyClientBookings } from '@/lib/api';
import type { Booking } from '@/types';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

function BookingList({ items }: { items: Booking[] }) {
  return (
    <ul className="space-y-3">
      {items.map((b) => (
        <li key={b.id} className="bg-white p-4 shadow rounded-lg">
          <div className="font-medium text-gray-900">{b.service.title}</div>
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
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {b.status}
            </span>
            <span className="text-sm text-gray-500">
              {formatCurrency(Number(b.total_price))}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ClientBookingsPage() {
  const { user } = useAuth();
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [past, setPast] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [upRes, pastRes] = await Promise.all([
          getMyClientBookings({ status: 'upcoming' }),
          getMyClientBookings({ status: 'past' }),
        ]);
        setUpcoming(upRes.data);
        setPast(pastRes.data);
      } catch (err) {
        console.error('Failed to load client bookings', err);
        setError('Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    if (user.user_type === 'client') {
      fetchData();
    } else {
      setLoading(false);
      setError('Access denied');
    }
  }, [user]);

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view your bookings.</div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-[60vh]">Loading...</div>
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
      <div className="max-w-3xl mx-auto p-4 space-y-6">
        <section>
          <h1 className="text-xl font-semibold mb-2">Upcoming Bookings</h1>
          {upcoming.length === 0 ? (
            <p>No upcoming bookings.</p>
          ) : (
            <BookingList items={upcoming} />
          )}
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-2">Past Bookings</h2>
          {past.length === 0 ? (
            <p>No past bookings.</p>
          ) : (
            <BookingList items={past} />
          )}
        </section>
      </div>
    </MainLayout>
  );
}
