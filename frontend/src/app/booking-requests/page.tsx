'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
// Avoid re-export indirection to prevent TDZ in Next/Flight
import useNotifications from '@/hooks/useNotifications.tsx';
import clsx from 'clsx';
import { Spinner } from '@/components/ui';
import { BookingRequestCard } from '@/components/dashboard';
import {
  getMyBookingRequests,
  getBookingRequestsForArtist,
} from '@/lib/api';
import type { BookingRequest, ThreadNotification } from '@/types';

export default function BookingRequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { items, markItem } = useNotifications();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);



  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const res =
          user.user_type === 'service_provider'
            ? await getBookingRequestsForArtist()
            : await getMyBookingRequests();
        setRequests(res.data);
      } catch (err) {
        console.error('Failed to fetch booking requests', err);
        setError('Failed to load booking requests.');
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [user]);

  const unreadCounts = useMemo(() => {
    const map: Record<number, number> = {};
    items.forEach((n) => {
      const thread = n as unknown as ThreadNotification;
      const brId = thread.booking_request_id;
      if (n.type === 'new_message' && brId) {
        const count = thread.unread_count ?? 0;
        if (count > 0) {
          map[brId] = (map[brId] || 0) + count;
        }
      }
      if (n.type === 'new_booking_request' && !n.is_read) {
        const match = n.link?.match(/booking-requests\/(\d+)/);
        if (match) {
          const id = Number(match[1]);
          map[id] = (map[id] || 0) + 1;
        }
      }
    });
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return requests
      .filter((r) => {
        const name = user?.user_type === 'service_provider'
          ? r.client
            ? `${r.client.first_name} ${r.client.last_name}`.toLowerCase()
            : ''
          : r.artist_profile
            ? (r.artist_profile.business_name || r.artist?.first_name || '').toLowerCase()
            : '';
        const matchesSearch = name.includes(lowerSearch);
        const matchesStatus =
          !statusFilter || r.status === statusFilter;
        const matchesService =
          !serviceFilter || r.service?.service_type === serviceFilter;
        return matchesSearch && matchesStatus && matchesService;
      });
  }, [requests, search, statusFilter, serviceFilter, user]);


  const handleRowClick = async (id: number) => {
    const related = items.filter((n) => {
      const thread = n as unknown as ThreadNotification;
      if (n.type === 'new_message' && thread.booking_request_id === id) {
        return (thread.unread_count ?? 0) > 0;
      }
      if (n.type === 'new_booking_request' && !n.is_read) {
        const match = n.link?.match(/booking-requests\/(\d+)/);
        return match ? Number(match[1]) === id : false;
      }
      return false;
    });
    for (const n of related) {
      await markItem(n);
    }
    router.push(`/booking-requests/${id}`);
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8">Please log in to view booking requests.</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Booking Requests</h1>
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && (
          <div className="bg-white rounded-md shadow overflow-hidden">
            <div className="p-2 space-y-2 sm:flex sm:space-y-0 sm:space-x-2 bg-gray-50">
              <input
                type="text"
                placeholder={user?.user_type === 'service_provider' ? 'Search by client name' : 'Search by artist name'}
                aria-label={user?.user_type === 'service_provider' ? 'Search by client name' : 'Search by artist name'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border rounded-md p-1 text-sm flex-1"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="border rounded-md p-1 text-sm"
              >
                <option value="">All Statuses</option>
                <option value="pending_quote">Pending Quote</option>
                <option value="quote_provided">Quote Provided</option>
                <option value="completed">Completed</option>
              </select>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                aria-label="Filter by service"
                className="border rounded-md p-1 text-sm"
              >
                <option value="">All Services</option>
                {Array.from(new Set(requests.map((r) => r.service?.service_type)))
                  .filter(Boolean)
                  .map((s) => (
                    <option key={s as string} value={s as string}>
                      {s as string}
                    </option>
                  ))}
              </select>
            </div>
            <ul className="divide-y divide-gray-200 p-2">
              {filtered.map((r) => {
                const count = unreadCounts[r.id] ?? 0;
                const unread = count > 0;
                const isNew = r.status === 'pending_quote';
                return (
                  <li
                    key={r.id}
                    data-request-id={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(r.id)}
                    onKeyPress={() => handleRowClick(r.id)}
                    className={clsx(
                      'relative cursor-pointer p-2 rounded-md hover:bg-gray-50 focus:outline-none',
                      unread
                        ? 'bg-brand-light border-l-4 border-brand'
                        : isNew
                          ? 'bg-blue-50'
                          : 'bg-white',
                    )}
                  >
                    {count > 0 && (
                      <span
                        className="absolute top-0 right-0 -mt-1 -mr-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full"
                        aria-label={`${count} unread updates`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                    <BookingRequestCard req={r} />
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="p-4 text-sm text-gray-500">No requests.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
