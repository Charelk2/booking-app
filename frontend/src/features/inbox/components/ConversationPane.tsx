"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BookingRequest, User } from '@/types';
import ConversationList from '@/components/chat/MessageThread/ConversationList';

type Props = {
  threads: BookingRequest[];
  selectedThreadId: number | null;
  onSelect: (id: number) => void;
  currentUser?: User | null;
  unreadTotal?: number;
  query: string;
  onQueryChange: (q: string) => void;
};

export default function ConversationPane({
  threads,
  selectedThreadId,
  onSelect,
  currentUser,
  unreadTotal = 0,
  query,
  onQueryChange,
}: Props) {
  const [listHeight, setListHeight] = useState<number>(0);
  const bodyId = useRef(`conversation-list-body-${Math.random().toString(36).slice(2)}`);

  useLayoutEffect(() => {
    const el = document.getElementById(bodyId.current);
    if (!el) return;
    const compute = () => setListHeight(el.clientHeight || 0);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, []);

  return (
    <div
      id="conversation-list-wrapper"
      className="w-full md:w-[320px] border-r border-gray-100 flex-shrink-0 h-full min-h-0 flex flex-col overflow-hidden"
    >
      <div className="p-3 sticky top-0 z-10 bg-white space-y-2 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Messages</h1>
          {Number(unreadTotal) > 0 && (
            <span
              aria-label={`${unreadTotal} unread messages`}
              className="inline-flex items-center justify-center rounded-full bg-black text-white min-w-[22px] h-6 px-2 text-xs font-semibold"
            >
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="text"
            aria-label="Search conversations"
            placeholder="Search by name or message"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="pointer-events-none absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
      </div>
      <div id={bodyId.current} className="flex-1 min-h-0">
        {threads.length > 0 ? (
          <ConversationList
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelect={onSelect}
            currentUser={currentUser}
            query={query}
            height={listHeight > 0 ? listHeight : undefined}
          />
        ) : (
          <p className="p-6 text-center text-gray-500">No conversations found.</p>
        )}
      </div>
    </div>
  );
}
