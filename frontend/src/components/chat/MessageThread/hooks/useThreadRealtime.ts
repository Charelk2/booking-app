// components/chat/MessageThread/hooks/useThreadRealtime.ts
'use client';

import { useEffect, useRef } from 'react';
import { useRealtimeContext } from '@/contexts/chat/RealtimeContext';
import { getSummaries as cacheGetSummaries, setSummaries as cacheSetSummaries, setLastRead as cacheSetLastRead, updateSummary as cacheUpdateSummary } from '@/lib/chat/threadCache';
import { threadStore } from '@/lib/chat/threadStore';

type UseThreadRealtimeOptions = {
  threadId: number;
  isActive: boolean;
  myUserId: number;
  ingestMessage: (raw: any) => void;
  applyReadReceipt: (upToId: number, readerId: number, myUserId?: number | null) => void;
  applyReactionEvent?: (evt: { messageId: number; emoji: string; userId: number; kind: 'added' | 'removed' }) => void;
  applyMessageDeleted?: (messageId: number) => void;
  applyDelivered?: (upToId: number, recipientId: number, myUserId?: number | null) => void;
  pokeDelta?: (reason?: string) => void;
};

const THREAD_TOPIC_PREFIX = 'booking-requests:';

export function useThreadRealtime({
  threadId,
  isActive,
  myUserId,
  ingestMessage,
  applyReadReceipt,
  applyReactionEvent,
  applyMessageDeleted,
  applyDelivered,
  pokeDelta,
}: UseThreadRealtimeOptions) {
  const { subscribe } = useRealtimeContext();

  // Dedup store per thread for incoming message ids (avoid double unread)
  const seenIdsRef = useRef<Map<number, Set<number>>>(new Map<number, Set<number>>()).current;
  if (!seenIdsRef.has(threadId)) seenIdsRef.set(threadId, new Set<number>());

  // Typing per-user timers (TTL)
  const typingTimersRef = useRef<Map<number, number>>(new Map());
  const scheduleTypingOff = (uid: number) => {
    try {
      const prev = typingTimersRef.current.get(uid);
      if (prev) window.clearTimeout(prev);
      const t = window.setTimeout(() => {
        try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
      }, 3000);
      typingTimersRef.current.set(uid, t);
    } catch {}
  };

  // Delivered debounce
  const deliveredMaxRef = useRef(0);
  const deliveredTimerRef = useRef<any>(0);

  // Simple reaction reconcile ticker (optional; avoids drift if WS drops)
  const reactionReconcileRef = useRef<number | null>(null);
  useEffect(() => {
    if (!applyReactionEvent) return;
    // Every 45s while tab visible and thread active, nudge a tiny delta to ensure parity without noisy fetches.
    const tick = () => {
      if (!isActive || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      try { pokeDelta?.('reaction-reconcile'); } catch {}
    };
    reactionReconcileRef.current = window.setInterval(tick, 45000) as unknown as number;
    return () => { if (reactionReconcileRef.current) window.clearInterval(reactionReconcileRef.current as any); };
  }, [applyReactionEvent, isActive, pokeDelta]);

  useEffect(() => {
    if (!threadId || !isActive) return;
    const topic = `${THREAD_TOPIC_PREFIX}${threadId}`;

    const unsubscribe = subscribe(topic, (evt: any) => {
      if (!evt) return;
      const type = evt.type;

      // message-like event
      if (!type || type === 'message' || type === 'message_new') {
        const raw = (evt?.payload && (evt.payload.message || evt.payload.data)) || evt.message || evt.data || evt;
        try { ingestMessage(raw); }
        catch (e) { try { console.warn('[realtime] ingest failed', e); } catch {} }

        try { if (typeof pokeDelta === 'function') setTimeout(() => { try { pokeDelta('post-ws-message'); } catch {} }, 120); } catch {}

        const senderId = Number(raw?.sender_id ?? raw?.senderId ?? 0);
        const mid = Number(raw?.id ?? 0);

        let seenSet = seenIdsRef.get(threadId)!;
        const isDuplicate = Number.isFinite(mid) && mid > 0 && seenSet.has(mid);

        if (Number.isFinite(senderId) && senderId > 0 && senderId !== myUserId) {
          if (!isDuplicate) {
            try {
              const list = cacheGetSummaries() as any[];
              const next = list.map((t) => Number(t?.id) === threadId ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 } : t);
              cacheSetSummaries(next as any);
            } catch {}
            if (Number.isFinite(mid) && mid > 0) {
              seenSet.add(mid);
              // Cap size to 500 ids to avoid unbounded growth (drop oldest half)
              if (seenSet.size > 500) {
                const half = Math.floor(seenSet.size / 2);
                const arr = Array.from(seenSet);
                for (let i = 0; i < half && i < arr.length; i++) {
                  seenSet.delete(arr[i]);
                }
              }
            }
          }
          // counterparty messaged → not typing
          try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
        } else if (Number.isFinite(raw?.id)) {
          // our own message → advance read
          cacheSetLastRead(threadId, Number(raw?.id));
        }

        // delivered ack push (we are recipient, thread visible/active)
        if (isActive && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Number.isFinite(senderId) && senderId !== myUserId && Number.isFinite(mid) && mid > 0) {
            deliveredMaxRef.current = Math.max(deliveredMaxRef.current || 0, mid);
            try { if (deliveredTimerRef.current) clearTimeout(deliveredTimerRef.current); } catch {}
            deliveredTimerRef.current = setTimeout(async () => {
              const up = deliveredMaxRef.current || 0;
              deliveredMaxRef.current = 0;
              if (up > 0) {
                try {
                  const mod = await import('@/lib/api');
                  await mod.putDeliveredUpTo(threadId, up);
                } catch {}
              }
            }, 140);
          }
        }
        return;
      }

      if (type === 'read') {
        const p = (evt?.payload || evt);
        const upToId = Number(p.up_to_id ?? p.last_read_id ?? p.message_id ?? 0);
        const readerId = Number(p.user_id ?? p.reader_id ?? 0);
        if (!Number.isFinite(upToId) || upToId <= 0 || !Number.isFinite(readerId) || readerId <= 0) return;
        if (readerId === myUserId) cacheSetLastRead(threadId, upToId);
        else applyReadReceipt(upToId, readerId, myUserId);
        return;
      }

      if (type === 'typing') {
        const p = (evt?.payload || evt);
        const users = Array.isArray(p.users) ? p.users : (typeof p.user_id === 'number' ? [p.user_id] : []);
        const typing = users.some((id: any) => Number(id) !== myUserId);
        cacheUpdateSummary(threadId, { typing });
        if (typing) {
          for (const uid of users) {
            if (Number(uid) !== myUserId) scheduleTypingOff(Number(uid));
          }
        }
        return;
      }

      if (type === 'presence') {
        try {
          const p = (evt?.payload || evt);
          const updates = (p?.updates || {}) as Record<string, string>;
          for (const [uid, status] of Object.entries(updates)) {
            const id = Number(uid);
            if (!Number.isFinite(id) || id === myUserId) continue;
            cacheUpdateSummary(threadId, { presence: (status || '').toString(), last_presence_at: Date.now() });
            break;
          }
        } catch {}
        return;
      }

      if (type === 'delivered' && applyDelivered) {
        const p = (evt?.payload || evt);
        const upToId = Number(p.up_to_id ?? p.last_delivered_id ?? 0);
        const recipientId = Number(p.user_id ?? p.recipient_id ?? 0);
        if (Number.isFinite(upToId) && upToId > 0 && Number.isFinite(recipientId) && recipientId > 0) {
          try { applyDelivered(upToId, recipientId, myUserId); } catch {}
        }
        return;
      }

      if ((type === 'reaction_added' || type === 'reaction_removed') && applyReactionEvent) {
        try {
          const p = ((evt?.payload && (evt.payload.payload || evt.payload)) || evt.payload || evt) as any;
          const mid = Number(p?.message_id ?? 0);
          const userId = Number(p?.user_id ?? 0);
          const emoji = (p?.emoji || '').toString();
          // Skip applying our own echo to avoid double-apply
          if (Number.isFinite(userId) && Number(userId) === Number(myUserId)) return;
          if (Number.isFinite(mid) && mid > 0 && emoji) {
            applyReactionEvent({ messageId: mid, emoji, userId, kind: type === 'reaction_added' ? 'added' : 'removed' });
          }
        } catch {}
        return;
      }

      if (type === 'message_deleted' && applyMessageDeleted) {
        const p = (evt?.payload || evt);
        const mid = Number(p?.id ?? p?.message_id ?? 0);
        if (Number.isFinite(mid) && mid > 0) {
          try { applyMessageDeleted(mid); } catch {}
        }
        return;
      }

      if (type === 'thread_tail') {
        const p = (evt?.payload || evt) as any;
        const tid = Number(p?.thread_id ?? threadId);
        const lastId = Number(p?.last_id ?? 0);
        const lastTs = (p?.last_ts || null) as string | null;
        const snippet = (p?.snippet || '') as string;

        const rawText = String(snippet || '').trim();
        const lowText = rawText.toLowerCase();
        let previewLabel = rawText;
        if (lowText.startsWith('payment received')) previewLabel = 'Payment received';

        if (Number.isFinite(tid) && tid === Number(threadId)) {
          try {
            threadStore.update(tid, {
              id: tid,
              last_message_id: Number.isFinite(lastId) && lastId > 0 ? lastId : (undefined as any),
              last_message_timestamp: (lastTs || undefined) as any,
              last_message_content: previewLabel || undefined,
            } as any);
          } catch {}
          try { pokeDelta?.('thread_tail'); } catch {}
        }
        return;
      }
    });

    return () => {
      // clear all typing timers for this thread
      try {
        Array.from(typingTimersRef.current.values()).forEach(t => { try { window.clearTimeout(t); } catch {} });
        typingTimersRef.current.clear();
      } catch {}
      unsubscribe();
    };
  }, [threadId, isActive, subscribe, ingestMessage, applyReadReceipt, myUserId, applyDelivered, applyReactionEvent, pokeDelta]);
}
