'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
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
            <Image
              src={getFullImageUrl(it.counterparty.avatar_url) as string}
              alt="Avatar"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFullImageUrl('/static/default-avatar.svg') as string;
              }}
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
            <div className="text-xs text-gray-600 truncate">{it.last_message_preview}</div>
          </div>
        </button>
      ))}
      {items.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-500">No conversations yet</div>
      )}
    </div>
  );
}

