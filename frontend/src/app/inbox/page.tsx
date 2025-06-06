'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import useNotifications from '@/hooks/useNotifications';

export default function InboxPage() {
  const { threads, loading, error, markThread } = useNotifications();
  const router = useRouter();

  const handleClick = async (id: number, link: string) => {
    await markThread(id);
    router.push(link);
  };

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Inbox</h1>
        {loading && <p>Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && threads.length === 0 && (
          <p className="text-sm text-gray-500">No messages yet.</p>
        )}
        <ul className="divide-y divide-gray-200">
          {threads.map((t) => (
            <li key={t.booking_request_id} className="py-3">
              <button
                type="button"
                onClick={() => handleClick(t.booking_request_id, t.link)}
                className="flex items-start gap-3 w-full text-left focus:outline-none hover:bg-gray-50 p-2 rounded-md"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium">
                  {t.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')}
                </div>
                <div className="flex-1">
                  <span className="block font-medium text-gray-900">
                    {t.name}
                    {t.unread_count > 0 && (
                      <span className="ml-1 text-xs font-semibold text-red-600">
                        {t.unread_count}
                      </span>
                    )}
                  </span>
                  <span className="block mt-0.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {t.last_message}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </MainLayout>
  );
}
