import { useEffect } from 'react';
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
  // Optional: request a quick delta reconcile after realtime if UI did not visibly update yet
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
  const seenIdsRef = (typeof window !== 'undefined') ? (window as any).__threadSeenIds ?? new Map<number, Set<number>>() : new Map<number, Set<number>>();
  if (typeof window !== 'undefined' && !(window as any).__threadSeenIds) {
    try { (window as any).__threadSeenIds = seenIdsRef; } catch {}
  }
  // Debounced delivered ack state
  const deliveredMaxRef = { current: 0 } as { current: number };
  const deliveredTimerRef = { current: 0 as any } as { current: any };

  useEffect(() => {
    if (!threadId || !isActive) return;
    const topic = `${THREAD_TOPIC_PREFIX}${threadId}`;
    let typingTimer: number | null = null;
    const scheduleTypingClear = () => {
      try { if (typingTimer != null) window.clearTimeout(typingTimer); } catch {}
      typingTimer = window.setTimeout(() => {
        try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
      }, 3000);
    };
    const unsubscribe = subscribe(topic, (evt: any) => {
      if (!evt) return;
      const type = evt.type;

      // Normalize envelope → message shape for message-like events
      if (!type || type === 'message' || type === 'message_new') {
        const raw = (evt?.payload && (evt.payload.message || evt.payload.data)) || evt.message || evt.data || evt;
        try {
          ingestMessage(raw);
        } catch (e) {
          try { console.warn('[realtime] ingest failed', e, { keys: raw && typeof raw === 'object' ? Object.keys(raw) : [] }); } catch {}
        }
        // Best-effort: nudge a tiny delta fetch shortly after to guarantee visibility.
        try {
          if (typeof pokeDelta === 'function') setTimeout(() => {
            try { pokeDelta('post-ws-message'); } catch {}
          }, 140);
        } catch {}
        const senderId = Number(raw?.sender_id ?? raw?.senderId ?? 0);
        const mid = Number(raw?.id ?? 0);
        // Deduplicate by message id to avoid double unread on fast+reliable deliveries
        let seenSet = seenIdsRef.get(threadId);
        if (!seenSet) { seenSet = new Set<number>(); seenIdsRef.set(threadId, seenSet); }
        const isDuplicate = Number.isFinite(mid) && mid > 0 && seenSet.has(mid);
        if (Number.isFinite(senderId) && senderId > 0 && senderId !== myUserId) {
          const isVisible = typeof document !== 'undefined' ? (document.visibilityState === 'visible') : true;
          if (isActive && isVisible && Number.isFinite(mid) && mid > 0) {
            // Active thread: treat incoming as read immediately; do not bump unread
            try { cacheSetLastRead(threadId, Number(mid)); } catch {}
          } else if (!isDuplicate) {
            try {
              const list = cacheGetSummaries() as any[];
              const next = list.map((t) => Number(t?.id) === threadId ? { ...t, unread_count: Math.max(0, Number(t?.unread_count || 0)) + 1 } : t);
              cacheSetSummaries(next as any);
            } catch {}
            if (Number.isFinite(mid) && mid > 0) {
              try {
                seenSet.add(mid);
                // Simple cap to avoid unbounded growth
                if (seenSet.size > 500) {
                  // Drop oldest half (best-effort; Set iteration order is insertion order in modern engines)
                  const half = Math.floor(seenSet.size / 2);
                  let i = 0; for (const v of seenSet) { seenSet.delete(v); if (++i >= half) break; }
                }
              } catch {}
            }
          }
          // Counterparty sent a message: they are no longer typing
          try { cacheUpdateSummary(threadId, { typing: false }); } catch {}
        } else if (Number.isFinite(raw?.id)) {
          cacheSetLastRead(threadId, Number(raw?.id));
        }
        // Delivered ack: if we are the recipient, visible and active, debounce a PUT
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
            }, 150);
          }
        }
        return;
      }

      if (type === 'read') {
        const p = (evt?.payload || evt);
        const upToId = Number(p.up_to_id ?? p.last_read_id ?? p.message_id ?? 0);
        const readerId = Number(p.user_id ?? p.reader_id ?? 0);
        if (!Number.isFinite(upToId) || upToId <= 0 || !Number.isFinite(readerId) || readerId <= 0) return;
        if (readerId === myUserId) {
          cacheSetLastRead(threadId, upToId);
        } else {
          applyReadReceipt(upToId, readerId, myUserId);
        }
        return;
      }

      if (type === 'typing') {
        const p = (evt?.payload || evt);
        const users = Array.isArray(p.users) ? p.users : [];
        const typing = users.some((id: any) => Number(id) !== myUserId);
        cacheUpdateSummary(threadId, { typing });
        if (typing) scheduleTypingClear();
        return;
      }

      if (type === 'presence') {
        try {
          const p = (evt?.payload || evt);
          const updates = (p?.updates || {}) as Record<string, string>;
          // Pick first counterparty status
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
          // Skip applying our own reaction event to avoid double-applying
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
        // Derive a friendly preview for known system lines to avoid a brief
        // flicker from raw content (e.g., order numbers) to the normalized
        // label once the server preview arrives.
        const rawText = String(snippet || '').trim();
        const lowText = rawText.toLowerCase();
        let previewLabel = rawText;
        if (lowText.startsWith('payment received')) {
          previewLabel = 'Payment received';
        }
        if (Number.isFinite(tid) && tid === Number(threadId)) {
          try {
            threadStore.update(tid, {
              id: tid,
              last_message_id: Number.isFinite(lastId) && lastId > 0 ? lastId : (undefined as any),
              last_message_timestamp: (lastTs || undefined) as any,
              last_message_content: previewLabel || undefined,
            } as any);
          } catch {}
          // Do not append a synthetic bubble for thread_tail. We rely on realtime
          // 'message' echoes and a tiny reconcile to ensure parity without
          // introducing a transient left-side bubble.
          // And nudge a tiny delta fetch to ensure parity if echo is delayed
          try { if (typeof pokeDelta === 'function') pokeDelta('thread_tail'); } catch {}
          // No reconcile events otherwise; UI ingests realtime directly
        }
        return;
      }
    });

    // Reconcile disabled - rely on realtime + explicit fetches by orchestrator.

    return () => {
      try { if (typingTimer != null) window.clearTimeout(typingTimer); } catch {}
      unsubscribe();
    };
  }, [threadId, isActive, subscribe, ingestMessage, applyReadReceipt, myUserId]);
}
