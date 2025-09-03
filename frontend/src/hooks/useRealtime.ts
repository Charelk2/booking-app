import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Mode = 'ws' | 'sse';
type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

export type RealtimeHandler = (data: any) => void;

interface UseRealtimeReturn {
  mode: Mode;
  status: Status;
  lastReconnectDelay: number | null;
  failureCount: number;
  subscribe: (topic: string, handler: RealtimeHandler) => () => void;
  publish: (topic: string, payload: Record<string, any>) => void;
  forceReconnect: () => void;
}

const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, 'ws') || '').replace(/\/+$/, '');
// Use configured API URL for SSE fallback; if unset, we can still operate in
// WebSocket mode.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

export default function useRealtime(token?: string | null): UseRealtimeReturn {
  const [mode, setMode] = useState<Mode>('ws');
  const [status, setStatus] = useState<Status>('closed');
  const [failureCount, setFailureCount] = useState(0);
  const lastDelayRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<any>(null);
  const attemptsRef = useRef(0);
  const subs = useRef<Map<string, Set<RealtimeHandler>>>(new Map());
  const pendingSubTopics = useRef<Set<string>>(new Set());
  const [wsToken, setWsToken] = useState<string | null>(token ?? null);
  useEffect(() => { setWsToken(token ?? null); }, [token]);

  const wsUrl = useMemo(() => {
    if (!WS_BASE) return null;
    return wsToken ? `${WS_BASE}/api/v1/ws?token=${encodeURIComponent(wsToken)}` : `${WS_BASE}/api/v1/ws`;
  }, [wsToken]);

  const sseUrlForTopics = useCallback((topics: string[]) => {
    if (!API_BASE) return null;
    const qs = new URLSearchParams();
    if (topics.length) qs.set('topics', topics.join(','));
    if (token) qs.set('token', token);
    return `${API_BASE}/api/v1/sse?${qs.toString()}`;
  }, [token]);

  const deliver = useCallback((msg: any) => {
    try {
      const topic = msg?.topic as string | undefined;
      if (!topic) return;
      const set = subs.current.get(topic);
      if (!set || set.size === 0) return;
      set.forEach((h) => {
        try { h(msg); } catch {}
      });
    } catch {}
  }, []);

  const openWS = useCallback(() => {
    if (!wsUrl) return;
    // Close any existing
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    setStatus(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      attemptsRef.current = 0;
      lastDelayRef.current = null;
      setStatus('open');
      // Heartbeat
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const base = isMobile ? 60 : 30;
      try { ws.send(JSON.stringify({ v: 1, type: 'heartbeat', interval: base })); } catch {}
      // Subscribe to all active topics
      const topics = Array.from(subs.current.keys());
      for (const t of topics) {
        try { ws.send(JSON.stringify({ v: 1, type: 'subscribe', topic: t })); } catch {}
      }
    };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string);
        if (data?.type === 'ping') {
          ws.send(JSON.stringify({ v: 1, type: 'pong' }));
          return;
        }
        if (data?.topic) deliver(data);
      } catch {}
    };
    const schedule = (e?: CloseEvent) => {
      if (e?.code === 4401) {
        setStatus('closed');
        return;
      }
      attemptsRef.current += 1;
      setFailureCount((c) => c + 1);
      const raw = Math.min(30000, 1000 * 2 ** (attemptsRef.current - 1));
      const jitter = Math.floor(Math.random() * 300);
      const delay = raw + jitter;
      lastDelayRef.current = delay;
      setStatus('reconnecting');
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        // Fallback to SSE after 6 failures
        if (attemptsRef.current >= 6) {
          setMode('sse');
          setStatus('connecting');
          openSSE();
        } else {
          openWS();
        }
      }, delay);
    };
    ws.onerror = () => { try { ws.close(); } catch {} schedule(); };
    ws.onclose = schedule;
  }, [wsUrl, deliver]);

  const openSSE = useCallback(() => {
    const topics = Array.from(subs.current.keys());
    const url = sseUrlForTopics(topics);
    if (!url) { setStatus('closed'); return; }
    try { esRef.current?.close(); } catch {}
    setStatus('connecting');
    const es = new EventSource(url, { withCredentials: true } as any);
    esRef.current = es;
    es.onopen = () => setStatus('open');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.topic) deliver(data);
      } catch {}
    };
    es.onerror = () => {
      setStatus('reconnecting');
      setFailureCount((c) => c + 1);
      // simple retry
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => openSSE(), 3000);
    };
  }, [sseUrlForTopics, deliver]);

  // If no explicit token was provided and we're operating in WS mode, try to
  // mint a fresh access token via the refresh endpoint using cookies. This
  // avoids having to persist the token in storage while still allowing
  // cross-origin WebSocket auth against the API host.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (wsToken || mode !== 'ws') return;
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        const body = await res.json().catch(() => null);
        const at = body?.access_token as string | undefined;
        if (at && !cancelled) setWsToken(at);
      } catch {
        // ignore; SSE fallback will still function via same-origin cookies
      }
    })();
    return () => { cancelled = true; };
  }, [wsToken, mode]);

  useEffect(() => {
    // Allow WS operation even when API_BASE is not configured; SSE requires
    // an HTTP base URL so only guard that path.
    if (mode === 'ws') {
      if (!WS_BASE) return;
      openWS();
    } else {
      if (!API_BASE) return;
      openSSE();
    }
    return () => {
      try { wsRef.current?.close(); } catch {}
      try { esRef.current?.close(); } catch {}
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wsUrl]);

  // Re-open SSE when topics change
  const refreshSSE = useCallback(() => {
    if (mode !== 'sse') return;
    openSSE();
  }, [mode, openSSE]);

  const subscribe = useCallback((topic: string, handler: RealtimeHandler) => {
    const set = subs.current.get(topic) || new Set<RealtimeHandler>();
    set.add(handler);
    subs.current.set(topic, set);
    // Notify server if WS is open
    if (mode === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ v: 1, type: 'subscribe', topic })); } catch {}
    }
    if (mode === 'sse') {
      refreshSSE();
    }
    return () => {
      const set2 = subs.current.get(topic);
      if (set2) {
        set2.delete(handler);
        if (set2.size === 0) subs.current.delete(topic);
      }
      if (mode === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ v: 1, type: 'unsubscribe', topic })); } catch {}
      }
      if (mode === 'sse') refreshSSE();
    };
  }, [mode, refreshSSE]);

  const publish = useCallback((topic: string, payload: Record<string, any>) => {
    if (mode !== 'ws') return; // no-op in SSE fallback
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    try { wsRef.current.send(JSON.stringify({ v: 1, topic, ...payload })); } catch {}
  }, [mode]);

  const forceReconnect = useCallback(() => {
    if (mode === 'ws') {
      try { wsRef.current?.close(); } catch {}
      openWS();
    } else {
      openSSE();
    }
  }, [mode, openWS, openSSE]);

  return {
    mode,
    status,
    lastReconnectDelay: lastDelayRef.current,
    failureCount,
    subscribe,
    publish,
    forceReconnect,
  };
}
