import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { threadStore } from '@/lib/chat/threadStore';
import { getThreadsIndex } from '@/lib/api';

function computeTotalUnread() {
  return threadStore.getTotalUnread();
}

export default function useUnreadThreadsCount() {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(() => computeTotalUnread());
  const fetchedRef = useRef(false);
  const SNAPSHOT_KEY = 'threads.index.snapshot';

  // Seed from snapshot synchronously to avoid 0→N flicker after refresh
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    try {
      const raw = sessionStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as { role?: string; ts?: number; items?: Array<{ id: number; unread_count: number; last_message_snippet?: string; last_message_at?: string }> };
      if (!payload || !Array.isArray(payload.items)) return;
      // If we already have threads in memory, skip snapshot seed
      if (threadStore.getThreads().length > 0) return;
      for (const it of payload.items) {
        const id = Number(it.id || 0);
        if (!Number.isFinite(id) || id <= 0) continue;
        threadStore.upsert({
          id,
          unread_count: Number(it.unread_count || 0) || 0,
          last_message_content: it.last_message_snippet || '',
          last_message_timestamp: it.last_message_at || null,
        } as any);
      }
      setCount(computeTotalUnread());
    } catch {}
  }, [user, loading]);

  const hydrateThreads = useCallback(async () => {
    if (!user || loading) return;
    if (threadStore.getThreads().length > 0 || fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const role = user.user_type === 'service_provider' ? 'artist' : 'client';
      const res = await getThreadsIndex(role, 100);
      const items = res.data?.items || [];
      for (const item of items) {
        const id = Number(item.booking_request_id || item.thread_id || 0);
        if (!Number.isFinite(id) || id <= 0) continue;
        threadStore.upsert({
          id,
          unread_count: Number(item.unread_count || 0) || 0,
          is_unread_by_current_user: Number(item.unread_count || 0) > 0,
          last_message_content: item.last_message_snippet,
          last_message_timestamp: item.last_message_at,
          counterparty_label: item.counterparty_name,
          updated_at: item.last_message_at,
          created_at: item.last_message_at,
        } as any);
      }
      // Persist a compact snapshot for next load (avoid 0→N flicker)
      try {
        const snapshot = {
          role: role,
          ts: Date.now(),
          items: items.map((it: any) => ({
            id: Number(it.booking_request_id || it.thread_id || 0) || 0,
            unread_count: Number(it.unread_count || 0) || 0,
            last_message_snippet: String(it.last_message_snippet || ''),
            last_message_at: it.last_message_at,
          })),
        };
        sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      } catch {}
    } catch {
      // best-effort; keep silent to avoid spamming header
    } finally {
      setCount(computeTotalUnread());
    }
  }, [user, loading]);

  useEffect(() => {
    const unsubscribe = threadStore.subscribe(() => {
      setCount(computeTotalUnread());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setCount(0);
      fetchedRef.current = false;
      return;
    }
    void hydrateThreads();
  }, [hydrateThreads, user, loading]);

  // Low-cost periodic reconciliation using /threads (ETag is handled inside getDeduped)
  useEffect(() => {
    if (!user || loading) return;
    let timer: any = null;
    let stopped = false;
    const role = user.user_type === 'service_provider' ? 'artist' : 'client';
    const tick = async () => {
      try {
        const res = await getThreadsIndex(role, 100);
        const items = res.data?.items || [];
        for (const it of items) {
          const id = Number(it.booking_request_id || it.thread_id || 0);
          if (!Number.isFinite(id) || id <= 0) continue;
          threadStore.upsert({
            id,
            unread_count: Number(it.unread_count || 0) || 0,
            last_message_content: it.last_message_snippet,
            last_message_timestamp: it.last_message_at,
          } as any);
        }
        // Update snapshot so reloads are instant
        try {
          const snapshot = {
            role: role,
            ts: Date.now(),
            items: items.map((it: any) => ({
              id: Number(it.booking_request_id || it.thread_id || 0) || 0,
              unread_count: Number(it.unread_count || 0) || 0,
              last_message_snippet: String(it.last_message_snippet || ''),
              last_message_at: it.last_message_at,
            })),
          };
          sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
        } catch {}
        setCount(computeTotalUnread());
      } catch {
        // best-effort; keep silent
      } finally {
        if (!stopped) timer = setTimeout(tick, 30000);
      }
    };
    timer = setTimeout(tick, 10000); // slight delay after mount to avoid racing initial hydrate
    return () => { stopped = true; if (timer) try { clearTimeout(timer); } catch {} };
  }, [user, loading]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ total?: number; delta?: number }>).detail || {};
      if (typeof detail.total === 'number') {
        setCount(Math.max(0, detail.total));
        return;
      }
      if (typeof detail.delta === 'number' && detail.delta !== 0) {
        setCount((prev) => Math.max(0, prev + detail.delta));
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('inbox:unread', handler as EventListener);
      const onStorage = (e: StorageEvent) => {
        if (!e.key) return;
        if (e.key.startsWith('thread:last_seen:')) {
          setCount(computeTotalUnread());
          return;
        }
        if (e.key === SNAPSHOT_KEY) {
          // Another tab updated snapshot; refresh count from store (or load snapshot if empty)
          try {
            if (threadStore.getThreads().length === 0 && e.newValue) {
              const payload = JSON.parse(e.newValue) as any;
              if (payload && Array.isArray(payload.items)) {
                for (const it of payload.items) {
                  const id = Number(it.id || 0);
                  if (!Number.isFinite(id) || id <= 0) continue;
                  threadStore.upsert({
                    id,
                    unread_count: Number(it.unread_count || 0) || 0,
                    last_message_content: String(it.last_message_snippet || ''),
                    last_message_timestamp: it.last_message_at || null,
                  } as any);
                }
              }
            }
          } catch {}
          setCount(computeTotalUnread());
        }
      };
      window.addEventListener('storage', onStorage as EventListener);
      return () => {
        window.removeEventListener('inbox:unread', handler as EventListener);
        window.removeEventListener('storage', onStorage as EventListener);
      };
    }
    return () => {};
  }, []);

  return useMemo(() => ({ count }), [count]);
}
