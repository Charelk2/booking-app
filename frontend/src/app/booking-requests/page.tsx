'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import useNotifications from '@/hooks/useNotifications';
import clsx from 'clsx';
import {
  getMyBookingRequests,
  getBookingRequestsForArtist,
} from '@/lib/api';
import type { BookingRequest } from '@/types';

export default function BookingRequestsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { items } = useNotifications();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const res =
          user.user_type === 'artist'
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

  const unreadIds = useMemo(() => {
    const set = new Set<number>();
    items.forEach((n) => {
      if (n.type === 'message' && n.booking_request_id && (n.unread_count ?? 0) > 0) {
        set.add(n.booking_request_id);
      }
      if (n.type === 'new_booking_request' && !n.is_read) {
        const match = n.link?.match(/booking-requests\/(\d+)/);
        if (match) set.add(Number(match[1]));
      }
    });
    return set;
  }, [items]);

  const filtered = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return requests
      .filter((r) => {
        const name = r.client
          ? `${r.client.first_name} ${r.client.last_name}`.toLowerCase()
          : '';
        const matchesSearch = name.includes(lowerSearch);
        const matchesStatus =
          !statusFilter || r.status === statusFilter;
        const matchesService =
          !serviceFilter || r.service?.service_type === serviceFilter;
        return matchesSearch && matchesStatus && matchesService;
      })
      .sort((a, b) => {
        const aDate = a.proposed_datetime_1
          ? new Date(a.proposed_datetime_1).getTime()
          : 0;
        const bDate = b.proposed_datetime_1
          ? new Date(b.proposed_datetime_1).getTime()
          : 0;
        return sortAsc ? aDate - bDate : bDate - aDate;
      });
  }, [requests, search, statusFilter, serviceFilter, sortAsc]);

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
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && (
          <div className="bg-white rounded-md shadow overflow-hidden">
            <div className="p-2 space-y-2 sm:flex sm:space-y-0 sm:space-x-2 bg-gray-50">
              <input
                type="text"
                placeholder="Search by client name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border rounded-md p-1 text-sm flex-1"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded-md p-1 text-sm"
              >
                <option value="">All Statuses</option>
                <option value="pending_quote">pending_quote</option>
                <option value="quote_provided">quote_provided</option>
                <option value="completed">completed</option>
              </select>
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="border rounded-md p-1 text-sm"
              >
                <option value="">All Services</option>
                {[...new Set(requests.map((r) => r.service?.service_type))]
                  .filter(Boolean)
                  .map((s) => (
                    <option key={s as string} value={s as string}>
                      {s as string}
                    </option>
                  ))}
              </select>
            </div>
            <div className="hidden sm:grid grid-cols-4 gap-4 bg-gray-50 p-2 text-sm font-semibold border-t">
              <div>Client Name</div>
              <div>Service Type</div>
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="text-left flex items-center"
              >
                <span className="mr-1">Proposed Date</span>
                {sortAsc ? '▲' : '▼'}
              </button>
              <div>Status</div>
            </div>
            <ul className="divide-y divide-gray-200">
              {filtered.map((r) => {
                const unread = unreadIds.has(r.id);
                return (
                  <li
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/booking-requests/${r.id}`)}
                    onKeyPress={() => router.push(`/booking-requests/${r.id}`)}
                    className={clsx(
                      'grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 cursor-pointer hover:bg-gray-50 focus:outline-none',
                      unread ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'bg-white',
                    )}
                  >
                    <div className="font-medium">
                      {r.client ? `${r.client.first_name} ${r.client.last_name}` : '—'}
                    </div>
                    <div className="text-sm sm:text-center">
                      {r.service?.service_type || '—'}
                    </div>
                    <div className="text-sm sm:text-center">
                      {r.proposed_datetime_1
                        ? new Date(r.proposed_datetime_1).toLocaleDateString()
                        : '—'}
                    </div>
                    <div className="text-sm sm:text-center">{r.status}</div>
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
