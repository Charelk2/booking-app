'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import useNotifications from '@/hooks/useNotifications';
import clsx from 'clsx';
import { Spinner } from '@/components/ui';
import {
  getMyBookingRequests,
  getBookingRequestsForArtist,
} from '@/lib/api';
import type { BookingRequest } from '@/types';

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
  const [openClients, setOpenClients] = useState<Record<number, boolean>>({});

  const statusLabels: Record<string, string> = {
    pending_quote: 'Pending Quote',
    quote_provided: 'Quote Provided',
    completed: 'Completed',
  };

  const formatStatus = (status: string) =>
    statusLabels[status] ||
    status
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' ');

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

  const unreadCounts = useMemo(() => {
    const map: Record<number, number> = {};
    items.forEach((n) => {
      if (n.type === 'message' && n.booking_request_id) {
        const count = n.unread_count ?? 0;
        if (count > 0) {
          map[n.booking_request_id] = (map[n.booking_request_id] || 0) + count;
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
        const name = r.client
          ? `${r.client.first_name} ${r.client.last_name}`.toLowerCase()
          : '';
        const matchesSearch = name.includes(lowerSearch);
        const matchesStatus =
          !statusFilter || r.status === statusFilter;
        const matchesService =
          !serviceFilter || r.service?.service_type === serviceFilter;
        return matchesSearch && matchesStatus && matchesService;
      });
  }, [requests, search, statusFilter, serviceFilter]);

  const grouped = useMemo(() => {
    const result: {
      clientId: number;
      clientName: string;
      requests: BookingRequest[];
    }[] = [];
    const map = new Map<number, number>();
    filtered.forEach((r) => {
      const id = r.client_id;
      const name = r.client
        ? `${r.client.first_name} ${r.client.last_name}`
        : '—';
      if (map.has(id)) {
        const idx = map.get(id)!;
        result[idx].requests.push(r);
      } else {
        map.set(id, result.length);
        result.push({ clientId: id, clientName: name, requests: [r] });
      }
    });
    return result;
  }, [filtered]);

  const handleRowClick = async (id: number) => {
    const related = items.filter((n) => {
      if (n.type === 'message' && n.booking_request_id === id) {
        return (n.unread_count ?? 0) > 0;
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
                placeholder="Search by client name"
                aria-label="Search by client name"
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
                {[...new Set(requests.map((r) => r.service?.service_type))]
                  .filter(Boolean)
                  .map((s) => (
                    <option key={s as string} value={s as string}>
                      {s as string}
                    </option>
                  ))}
              </select>
            </div>
            <div className="hidden sm:grid grid-cols-3 gap-4 bg-gray-50 p-2 text-sm font-semibold border-t">
              <div>Service Type</div>
              <div className="text-left">Proposed Date</div>
              <div>Status</div>
            </div>
            <ul className="divide-y divide-gray-200">
              {grouped.map((g) => (
                <li key={`client-${g.clientId}`}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenClients((o) => ({ ...o, [g.clientId]: !o[g.clientId] }))
                    }
                    aria-expanded={openClients[g.clientId] || false}
                    aria-controls={`requests-${g.clientId}`}
                    className="w-full text-left p-4 bg-gray-50 font-medium flex items-center justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  >
                    <span>
                      {openClients[g.clientId] ? '▼' : '▶'} {g.clientName} ({g.requests.length} requests)
                    </span>
                  </button>
                  {openClients[g.clientId] && (
                    <ul id={`requests-${g.clientId}`} className="divide-y divide-gray-200">
                      {g.requests.map((r) => {
                        const count = unreadCounts[r.id] ?? 0;
                        const unread = count > 0;
                        return (
                          <li
                            key={r.id}
                            data-request-id={r.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleRowClick(r.id)}
                            onKeyPress={() => handleRowClick(r.id)}
                            className={clsx(
                              'grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 pl-6 cursor-pointer hover:bg-gray-50 focus:outline-none',
                              unread ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'bg-white',
                            )}
                          >
                            <div className="text-sm sm:text-center">
                              {r.service?.service_type || '—'}
                            </div>
                            <div className="text-sm sm:text-center">
                              {r.proposed_datetime_1
                                ? new Date(r.proposed_datetime_1).toLocaleDateString()
                                : '—'}
                            </div>
                            <div className="text-sm sm:text-center flex items-center justify-between sm:justify-center">
                              <span>{formatStatus(r.status)}</span>
                              {count > 0 && (
                                <span
                                  className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full"
                                  aria-label={`${count} unread updates`}
                                >
                                  {count > 99 ? '99+' : count}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              ))}
              {grouped.length === 0 && (
                <li className="p-4 text-sm text-gray-500">No requests.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
