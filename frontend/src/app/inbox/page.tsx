'use client';

import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
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
  const { items, loading, error, markItem } = useNotifications();
  const router = useRouter();

  const messageThreads = useMemo(
    () => items.filter((i) => i.type === 'message' && i.booking_request_id),
    [items],
  );

  const [activeTab, setActiveTab] = useState<'requests' | 'chats'>('requests');
  const [bookings, setBookings] = useState<BookingPreview[]>([]);
  const [chats, setChats] = useState<typeof messageThreads>([]);

  useEffect(() => {
    const fetchData = async () => {
      const bookingList: BookingPreview[] = [];
      const chatList: typeof messageThreads = [];

      await Promise.all(
        messageThreads.map(async (t) => {
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
                unread: t.unread_count,
              });
            } else {
              chatList.push(t);
            }
          } catch (err) {
            console.error(
              'Failed to fetch messages for thread',
              t.booking_request_id,
              err
            );
            chatList.push(t);
          }
        })
      );

      setBookings(bookingList);
      setChats(chatList);
    };

    if (messageThreads.length > 0) {
      fetchData();
    } else {
      setBookings([]);
      setChats([]);
    }
  }, [messageThreads]);

  const handleClick = async (id: number) => {
    const item = messageThreads.find((t) => t.booking_request_id === id);
    if (item && !item.is_read) {
      await markItem(item);
    }

    if (activeTab === 'requests') {
      router.push(`/booking-requests/${id}`);
    } else {
      router.push(`/messages/thread/${id}`);
    }
  };

  const renderBookings = () => (
    <ul className="space-y-3">
      {bookings.map((b) => (
        <li key={b.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleClick(b.id)}
            onKeyPress={() => handleClick(b.id)}
            className={clsx(
              'shadow rounded-lg p-4 space-y-2 cursor-pointer active:bg-gray-100 transition',
              b.unread > 0
                ? 'bg-indigo-50 border-l-4 border-indigo-500'
                : 'bg-white'
            )}
          >
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
        </li>
      ))}
    </ul>
  );

  const renderChats = () => (
    <div>
      {chats.map((t) => {
        const initials = t.name
          .split(' ')
          .map((w) => w[0])
          .join('');
        return (
          <div
            key={t.booking_request_id}
            role="button"
            tabIndex={0}
            onClick={() => handleClick(t.booking_request_id)}
            onKeyPress={() => handleClick(t.booking_request_id)}
            className="flex items-center space-x-3 px-4 py-3 border-b cursor-pointer hover:bg-gray-50 active:bg-gray-100"
          >
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-gray-500 truncate">{t.content}</div>
            </div>
            <div className="text-xs text-gray-400">
              {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <div className="flex space-x-4 border-b mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`pb-2 font-medium ${
              activeTab === 'requests' ? 'border-b-2 border-indigo-600' : 'text-gray-500'
            }`}
          >
            Booking Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`pb-2 font-medium ${
              activeTab === 'chats' ? 'border-b-2 border-indigo-600' : 'text-gray-500'
            }`}
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
