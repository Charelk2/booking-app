'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import useNotifications from '@/hooks/useNotifications';
import { getMessagesForBookingRequest } from '@/lib/api';

interface BookingPreview {
  id: number;
  senderName: string;
  formattedDate: string;
  location?: string;
  guests?: string;
  venueType?: string;
  notes?: string;
  unread: number;
}

export default function InboxPage() {
  const { threads, loading, error, markThread } = useNotifications();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'requests' | 'chats'>('requests');
  const [bookings, setBookings] = useState<BookingPreview[]>([]);
  const [chats, setChats] = useState<typeof threads>([]);

  useEffect(() => {
    async function loadThreads() {
      const reqs: BookingPreview[] = [];
      const chs: typeof threads = [];
      await Promise.all(
        threads.map(async (t) => {
          try {
            const res = await getMessagesForBookingRequest(t.booking_request_id);
            const bookingMsg = res.data.find(
              (m) => m.message_type === 'system' && m.content.startsWith('Booking details:')
            );
            if (bookingMsg) {
              const [_, ...lines] = bookingMsg.content.split('\n');
              const details = lines.reduce<Record<string, string>>((acc, line) => {
                const [key, ...rest] = line.split(':');
                if (key && rest.length) {
                  acc[key.trim().toLowerCase()] = rest.join(':').trim();
                }
                return acc;
              }, {});
              reqs.push({
                id: t.booking_request_id,
                senderName: t.name,
                formattedDate: new Date(bookingMsg.timestamp).toLocaleDateString(),
                location: details.location,
                guests: details.guests,
                venueType: details['venue type'],
                notes: details.notes,
                unread: t.unread_count,
              });
            } else {
              chs.push(t);
            }
          } catch {
            chs.push(t);
          }
        })
      );
      setBookings(reqs);
      setChats(chs);
    }

    if (!loading && threads.length) loadThreads();
    else if (threads.length === 0) {
      setBookings([]);
      setChats([]);
    }
  }, [threads, loading]);

  const navigateToThread = async (id: number) => {
    await markThread(id);
    const path = activeTab === 'requests' ? `/bookings/${id}` : `/messages/thread/${id}`;
    router.push(path);
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold mb-4">Inbox</h1>
        <div className="flex border-b mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 text-center font-medium ${
              activeTab === 'requests'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Booking Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2 text-center font-medium ${
              activeTab === 'chats'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Chats
          </button>
        </div>

        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && !bookings.length && !chats.length && (
          <p className="text-gray-500">No messages yet.</p>
        )}

        {activeTab === 'requests' && (
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">🧾 Booking Requests</h2>
            <ul className="space-y-3">
              {bookings.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => navigateToThread(b.id)}
                    className="w-full text-left bg-white shadow rounded-lg p-4 space-y-2 hover:bg-gray-50 active:bg-gray-100 transition"
                  >
                    <div className="flex justify-between">
                      <span className="font-semibold text-sm">{b.senderName}</span>
                      <span className="text-xs text-gray-500">{b.formattedDate}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      📍 {b.location ?? '—'} | 👥 {b.guests ?? '—'} | 🏠 {b.venueType ?? '—'}
                    </div>
                    {b.notes && (
                      <div className="text-xs text-gray-500 truncate">📝 {b.notes}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'chats' && (
          <section className="space-y-2">
            {chats.map((t) => {
              const initials = t.name
                .split(' ')
                .map((w) => w[0])
                .join('');
              return (
                <button
                  key={t.booking_request_id}
                  type="button"
                  onClick={() => navigateToThread(t.booking_request_id)}
                  className="flex items-center space-x-3 p-3 bg-white rounded-lg shadow hover:bg-gray-50 active:bg-gray-100 w-full text-left transition"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                    {initials}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="font-medium text-sm truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 truncate">{t.last_message}</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                  </p>
                </button>
              );
            })}
          </section>
        )}
      </div>
    </MainLayout>
  );
}
```
