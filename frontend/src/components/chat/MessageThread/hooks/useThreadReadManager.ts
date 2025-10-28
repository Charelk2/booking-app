import { useCallback, useEffect, useRef } from 'react';
import { markThreadMessagesRead } from '@/lib/api';
import { runWithTransport } from '@/lib/transportState';
import { getSummaries as cacheGetSummaries, setLastRead as cacheSetLastRead } from '@/lib/chat/threadCache';

export const THREAD_READ_EVENT = 'thread:read';

type UseThreadReadManagerOptions = {
  threadId: number;
  messages: any[];
  isActive: boolean;
  myUserId: number;
};

export function useThreadReadManager({ threadId, messages, isActive, myUserId }: UseThreadReadManagerOptions) {
  const lastAcknowledgedRef = useRef<number>(0);
  const inflightRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpToRef = useRef<number | null>(null);

  useEffect(() => {
    lastAcknowledgedRef.current = 0;
    inflightRef.current = null;
    if (debounceTimerRef.current) { try { clearTimeout(debounceTimerRef.current); } catch {} debounceTimerRef.current = null; }
    pendingUpToRef.current = null;
  }, [threadId]);

  const fireEvent = useCallback(
    (lastMessageId: number) => {
      if (typeof window === 'undefined') return;
      try {
        window.dispatchEvent(
          new CustomEvent(THREAD_READ_EVENT, {
            detail: { threadId, lastMessageId },
          }),
        );
      } catch {}
    },
    [threadId],
  );

  const flushMark = useCallback(
    (lastMessageId: number) => {
      if (!threadId) return;
      inflightRef.current = lastMessageId;

      const prev = (cacheGetSummaries() as any[]).find((t) => t.id === threadId);
      const prevUnread = Number(prev?.unread_count || 0);
      if (prevUnread > 0 && typeof window !== 'undefined') {
        try {
          window.dispatchEvent(
            new CustomEvent('inbox:unread', {
              detail: { delta: -prevUnread, threadId },
            }),
          );
        } catch {}
      }

      cacheSetLastRead(threadId, lastMessageId);
      fireEvent(lastMessageId);

      const maybe = runWithTransport(
        `thread-read:${threadId}`,
        async () => { await markThreadMessagesRead(threadId); },
        {
          metadata: {
            type: 'markThreadMessagesRead',
            threadId,
            lastMessageId,
          },
        },
      );
      if (maybe && typeof (maybe as any).finally === 'function') {
        (maybe as Promise<void>).finally(() => {
          if (inflightRef.current === lastMessageId) inflightRef.current = null;
        });
      } else {
        // If task is enqueued (void), clear inflight immediately
        if (inflightRef.current === lastMessageId) inflightRef.current = null;
      }
    },
    [threadId, fireEvent],
  );

  const scheduleMark = useCallback((upToId: number) => {
    // Coalesce multiple reads into a single write per debounce window
    if (!Number.isFinite(upToId) || upToId <= 0) return;
    const prev = Number(pendingUpToRef.current || 0);
    if (!prev || upToId > prev) pendingUpToRef.current = upToId;
    if (debounceTimerRef.current) return; // already scheduled
    debounceTimerRef.current = setTimeout(() => {
      const target = Number(pendingUpToRef.current || 0);
      pendingUpToRef.current = null;
      debounceTimerRef.current = null;
      if (Number.isFinite(target) && target > 0) flushMark(target);
    }, 500);
  }, [flushMark]);

  useEffect(() => {
    if (!isActive) return;
    if (!Array.isArray(messages) || messages.length === 0) return;
    const latestIncoming = [...messages]
      .slice()
      .reverse()
      .find((msg) => Number(msg?.sender_id ?? msg?.senderId ?? 0) !== myUserId);
    const latestId = Number(latestIncoming?.id ?? 0);
    if (!Number.isFinite(latestId) || latestId <= 0) return;
    if (latestId <= lastAcknowledgedRef.current) return;
    lastAcknowledgedRef.current = latestId;
    scheduleMark(latestId);
  }, [isActive, messages, scheduleMark, myUserId]);
}
