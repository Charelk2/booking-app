'use client';

import React, { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import MainLayout from '@/components/layout/MainLayout';
import useNotifications from '@/hooks/useNotifications';
import { Spinner } from '@/components/ui';


interface BookingPreview {
  id: number;
  senderName: string;
  formattedDate: string;
  location?: string;
  guests?: string;
  venueType?: string;
  unread: number;
}

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
    const bookingList: BookingPreview[] = [];
    const chatList: typeof messageThreads = [];

    messageThreads.forEach((t) => {
      if (t.booking_details) {
        bookingList.push({
          id: t.booking_request_id,
          senderName: t.name,
          formattedDate: new Date(t.booking_details.timestamp).toLocaleDateString(),
          location: t.booking_details.location,
          guests: t.booking_details.guests,
          venueType: t.booking_details.venue_type,
          unread: t.unread_count,
        });
      } else {
        chatList.push(t);
      }
    });

    setBookings(bookingList);
    setChats(chatList);
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
                ? 'bg-brand-light border-l-4 border-brand'
                : 'bg-white'
            )}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{b.senderName}</span>
                {b.unread > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
                    {b.unread > 99 ? '99+' : b.unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{b.formattedDate}</span>
                {b.unread > 0 && (
                  <span
                    className="w-2 h-2 bg-red-600 rounded-full"
                    aria-label="Unread messages"
                  />
                )}
              </div>
            </div>
            <div className="text-sm text-gray-600">
              📍 {b.location || '—'} | 👥 {b.guests || '—'} | 🏠 {b.venueType || '—'}
            </div>
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
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
              {initials}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">{t.name}</div>
                {(t.unread_count ?? 0) > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full">
                    {t.unread_count && t.unread_count > 99 ? '99+' : t.unread_count}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 truncate">{t.content}</div>
            </div>
            <div className="flex items-center gap-2">
              <time
                dateTime={t.timestamp}
                title={new Date(t.timestamp).toLocaleString()}
                className="text-xs text-gray-400"
              >
                <span className="sr-only">
                  {new Date(t.timestamp).toLocaleString()}
                </span>
                {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
              </time>
              {(t.unread_count ?? 0) > 0 && (
                <span
                  className="w-2 h-2 bg-red-600 rounded-full"
                  aria-label="Unread messages"
                />
              )}
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
              activeTab === 'requests' ? 'border-b-2 border-brand-dark' : 'text-gray-500'
            }`}
          >
            Booking Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`pb-2 font-medium ${
              activeTab === 'chats' ? 'border-b-2 border-brand-dark' : 'text-gray-500'
            }`}
          >
            Chats
          </button>
        </div>
        {loading && <Spinner className="my-4" />}
        {error && <p className="text-red-600">{error.message}</p>}
        {!loading && !error && bookings.length === 0 && chats.length === 0 && (
          <p className="text-sm text-gray-500">No messages yet.</p>
        )}
        {activeTab === 'requests' ? renderBookings() : renderChats()}
      </div>
    </MainLayout>
  );
}
