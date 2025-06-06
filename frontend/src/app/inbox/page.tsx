'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  link: string;
  unread: number;
}

const parseBookingDetails = (text: string) => {
  const lines = text.split('\n').slice(1);
  const details: Record<string, string> = {};
  lines.forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      details[key.trim().toLowerCase()] = rest.join(':').trim();
    }
  });
  return {
    location: details.location,
    guests: details.guests,
    venueType: details['venue type'],
    notes: details.notes,
  };
};

export default function InboxPage() {
  const { threads, loading, error, markThread } = useNotifications();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'requests' | 'chats'>('requests');
  const [bookings, setBookings] = useState<BookingPreview[]>([]);
  const [chats, setChats] = useState<typeof threads>([]);

  useEffect(() => {
    const fetchData = async () => {
      const bookingList: BookingPreview[] = [];
      const chatList: typeof threads = [];
      await Promise.all(
        threads.map(async (t) => {
          try {
            const res = await getMessagesForBookingRequest(t.booking_request_id);
            const bookingMsg = res.data.find(
              (m) =>
                m.message_type === 'system' &&
                m.content.startsWith('Booking details:')
            );
            if (bookingMsg) {
              const details = parseBookingDetails(bookingMsg.content);
              bookingList.push({
                id: t.booking_request_id,
                senderName: t.name,
                formattedDate: new Date(bookingMsg.timestamp).toLocaleDateString(),
                ...details,
                link: t.link,
                unread: t.unread_count,
              });
            } else {
              chatList.push(t);
            }
          } catch (err) {
            console.error('Failed to fetch messages for thread', t.booking_request_id, err);
            chatList.push(t);
          }
        })
      );
      setBookings(bookingList);
      setChats(chatList);
    };

    if (threads.length > 0) {
      fetchData();
    } else {
      setBookings([]);
      setChats([]);
    }
  }, [threads]);

  const handleClick = async (id: number, link: string) => {
    await markThread(id);
    router.push(link);
  };

  const renderBookings = () => (
    <ul className="space-y-3">
      {bookings.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => handleClick(b.id, b.link)}
            className="w-full text-left"
          >
            <div className="bg-white shadow rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm">{b.senderName}</span>
                <span className="text-xs text-gray-500">{b.formattedDate}</span>
              </div>
              <div className="text-sm text-gray-600">
                📍 {b.location || '—'} | 👥 {b.guests || '—'} | 🏠 {b.venueType || '—'}
              </div>
              {b.notes && (
                <div className="text-xs text-gray-500 truncate">📝 {b.notes}</div>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );

  const renderChats = () => (
    <ul className="divide-y divide-gray-200">
      {chats.map((t) => {
        const initials = t.name
          .split(' ')
          .map((w) => w[0])
          .join('');
        return (
          <li key={t.booking_request_id} className="py-2">
            <button
              type="button"
              onClick={() => handleClick(t.booking_request_id, t.link)}
              className="flex items-center space-x-3 w-full text-left hover:bg-gray-50 p-2 rounded-md"
            >
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                {initials}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{t.name}</div>
                <div className="text-xs text-gray-500 truncate">{t.last_message}</div>
              </div>
              <div className="text-xs text-gray-400">
                {new Date(t.timestamp).toLocaleDateString()}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="flex space-x-4 border-b mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`pb-2 font-medium ${activeTab === 'requests' ? 'border-b-2 border-indigo-600' : 'text-gray-500'}`}
          >
            Booking Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`pb-2 font-medium ${activeTab === 'chats' ? 'border-b-2 border-indigo-600' : 'text-gray-500'}`}
          >
            Chats
          </button>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && bookings.length === 0 && chats.length === 0 && (
          <p className="text-sm text-gray-500">No messages yet.</p>
        )}
        {activeTab === 'requests' ? renderBookings() : renderChats()}
      </div>
    </MainLayout>
  );
}
