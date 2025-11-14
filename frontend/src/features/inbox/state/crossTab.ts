import { setLastRead as cacheSetLastRead } from '@/lib/chat/threadCache';

// Local copy of the thread read event name to avoid a circular dependency
// on the MessageThread hooks module (which also imports the thread cache).
const THREAD_READ_EVENT = 'thread:read';

type Msg =
  | { t: 'hello'; id: string }
  | { t: 'thread_read'; id: string; threadId: number; lastMessageId: number; readAt?: string | null }
  | { t: 'threads_updated'; id: string; detail?: any }
  | { t: 'active_thread'; id: string; threadId: number | null }
  | { t: 'clear_caches'; id: string };

let channel: BroadcastChannel | null = null;
let selfId: string | null = null;

export function initCrossTabSync() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return () => {};
  if (!selfId) selfId = Math.random().toString(36).slice(2);
  if (!channel) channel = new BroadcastChannel('inbox-threads');

  const onThreadRead = (e: Event) => {
    try {
      const d = (e as CustomEvent<{ threadId: number; lastMessageId: number }>).detail;
      const msg: Msg = { t: 'thread_read', id: selfId!, threadId: Number(d.threadId), lastMessageId: Number(d.lastMessageId) };
      channel!.postMessage(msg);
    } catch {}
  };
  const onThreadsUpdated = (e: Event) => {
    try {
      const d = (e as CustomEvent<any>).detail;
      const msg: Msg = { t: 'threads_updated', id: selfId!, detail: d };
      channel!.postMessage(msg);
    } catch {}
  };

  const onMessage = (ev: MessageEvent<Msg>) => {
    const data = ev.data;
    if (!data || (data as any).id === selfId) return;
    if (data.t === 'thread_read') {
      const { threadId, lastMessageId, readAt } = data;
      if (Number.isFinite(threadId) && threadId > 0) {
        try { cacheSetLastRead(threadId, Number(lastMessageId) || undefined); } catch {}
      }
      return;
    }
    if (data.t === 'active_thread') {
      try {
        const tid = Number(data.threadId ?? 0) || null;
        if (typeof window !== 'undefined') {
          (window as any).__inboxActiveThreadId = tid;
        }
      } catch {}
      return;
    }
    if (data.t === 'threads_updated') {
      try { window.dispatchEvent(new CustomEvent('threads:updated', { detail: data.detail || {} })); } catch {}
      return;
    }
    if (data.t === 'clear_caches') {
      try { clearCachesLocal(); } catch {}
      return;
    }
  };

  window.addEventListener(THREAD_READ_EVENT, onThreadRead as EventListener);
  window.addEventListener('threads:updated', onThreadsUpdated as EventListener);
  channel.addEventListener('message', onMessage as EventListener);

  // Greet
  try { channel.postMessage({ t: 'hello', id: selfId! } satisfies Msg); } catch {}

  return () => {
    try { window.removeEventListener(THREAD_READ_EVENT, onThreadRead as EventListener); } catch {}
    try { window.removeEventListener('threads:updated', onThreadsUpdated as EventListener); } catch {}
    try { channel?.removeEventListener('message', onMessage as EventListener); } catch {}
  };
}

function clearCachesLocal() {
  try {
    // Remove session keys
    const s = window.sessionStorage;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (!k) continue;
      if (k.startsWith('inbox:threadsCache:') || k.startsWith('inbox:threadsIndexEtag:') || k.startsWith('inbox:convList')) keys.push(k);
    }
    keys.forEach((k) => {
      try { s.removeItem(k); } catch {}
    });
  } catch {}
  try {
    // Remove local keys
    const l = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < l.length; i += 1) {
      const k = l.key(i);
      if (!k) continue;
      if (k.startsWith('inbox:threadsCache:')) keys.push(k);
    }
    keys.forEach((k) => {
      try { l.removeItem(k); } catch {}
    });
  } catch {}
}

export function broadcastClearCaches() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  if (!selfId) selfId = Math.random().toString(36).slice(2);
  if (!channel) channel = new BroadcastChannel('inbox-threads');
  try { channel.postMessage({ t: 'clear_caches', id: selfId! } as Msg); } catch {}
  // also clear local caches immediately in this tab
  try { clearCachesLocal(); } catch {}
}

export function broadcastActiveThread(threadId: number | null) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  if (!selfId) selfId = Math.random().toString(36).slice(2);
  if (!channel) channel = new BroadcastChannel('inbox-threads');
  try { channel.postMessage({ t: 'active_thread', id: selfId!, threadId } as Msg); } catch {}
  try { (window as any).__inboxActiveThreadId = threadId ?? null; } catch {}
}
