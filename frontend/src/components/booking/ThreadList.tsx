'use client';

import React, { useEffect, useState } from 'react';
import SafeImage from '@/components/ui/SafeImage';
import { getMessageThreadsPreview } from '@/lib/api';
import { ThreadPreview } from '@/types';
import { getFullImageUrl } from '@/lib/utils';

interface ThreadListProps {
  role?: 'artist' | 'client';
  onOpenThread?: (threadId: number) => void;
}

export default function ThreadList({ role, onOpenThread }: ThreadListProps) {
  const [items, setItems] = useState<ThreadPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await getMessageThreadsPreview(role);
        if (!mounted) return;
        setItems(res.data.items || []);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load threads');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [role]);

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading threads…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>;

  return (
    <div className="flex flex-col divide-y divide-gray-200">
      {items.map((it) => (
        <button
          key={it.thread_id}
          type="button"
          className="flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
          onClick={() => onOpenThread?.(it.thread_id)}
        >
          {it.counterparty.avatar_url ? (
            <SafeImage
              src={it.counterparty.avatar_url}
              alt="Avatar"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
              sizes="36px"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium">
              {it.counterparty.name?.charAt(0) || '?'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900 truncate">{it.counterparty.name}</span>
              {it.unread_count > 0 && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-purple-600 text-white text-xs px-2 py-0.5">
                  {it.unread_count}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-600 truncate flex items-center gap-1">
              <svg
                aria-label={it.unread_count > 0 ? 'Unread' : 'Read'}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className={`h-4 w-4 ${it.unread_count > 0 ? 'text-gray-400' : 'text-blue-600'}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M12.75 12.75L15 15 18.75 9.75" />
              </svg>
              <span className="truncate">{it.last_message_preview}</span>
            </div>
          </div>
        </button>
      ))}
      {items.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-500">No conversations yet</div>
      )}
    </div>
  );
}
