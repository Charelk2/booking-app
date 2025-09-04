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

// Compute realtime endpoints with safe defaults.
// - WS: prefer explicit NEXT_PUBLIC_WS_URL (e.g., wss://api.booka.co.za); else same-origin (http->ws)
// - SSE: always use a same-origin relative path so it flows through Next.js rewrites
let WS_BASE_ENV = (process.env.NEXT_PUBLIC_WS_URL || '') as string;
WS_BASE_ENV = WS_BASE_ENV.replace(/\/+$/, '');

export default function useRealtime(token?: string | null): UseRealtimeReturn {
  const DEBUG = typeof window !== 'undefined' && (localStorage.getItem('CHAT_DEBUG') === '1');
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
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  useEffect(() => { setWsToken(token ?? null); }, [token]);

  const wsBase = useMemo(() => {
    if (WS_BASE_ENV) return WS_BASE_ENV.replace(/^http/, 'ws');
    if (typeof window !== 'undefined') return window.location.origin.replace(/^http/, 'ws');
    return '';
  }, []);

  const wsUrl = useMemo(() => {
    if (!wsBase) return null;
    // Require an explicit token to open WS. Cookie-based WS can be flaky across
    // subdomains and causes noisy retries for anonymous users. Authenticated
    // views pass a token from AuthContext.
    if (!wsToken) return null;
    return `${wsBase}/api/v1/ws?token=${encodeURIComponent(wsToken)}`;
  }, [wsBase, wsToken]);

  const sseUrlForTopics = useCallback((topics: string[]) => {
    const qs = new URLSearchParams();
    if (topics.length) qs.set('topics', topics.join(','));
    if (token) qs.set('token', token);
    // Always use same-origin so SSE streams through Next.js rewrites (avoids CORS/proxy drift)
    return `/api/v1/sse?${qs.toString()}`;
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

  // When server omits a topic, fan out to all current subscribers, tagging the
  // delivered message with each subscription topic. Downstream filters will
  // drop mismatches based on booking/thread ids.
  const deliverFanout = useCallback((msg: any) => {
    try {
      subs.current.forEach((handlers, topic) => {
        handlers.forEach((h) => {
          try { h({ ...msg, topic }); } catch {}
        });
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
      if (DEBUG) try { console.info('[rt] ws open', { url: wsUrl }); } catch {}
      // Heartbeat
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const base = isMobile ? 60 : 30;
      try { ws.send(JSON.stringify({ v: 1, type: 'heartbeat', interval: base })); } catch {}
      // Subscribe to all active topics
      const topics = Array.from(subs.current.keys());
      for (const t of topics) {
        try { ws.send(JSON.stringify({ v: 1, type: 'subscribe', topic: t })); } catch {}
        if (DEBUG) try { console.info('[rt] ws subscribe', t); } catch {}
      }
    };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string);
        if (data?.type === 'ping') {
          ws.send(JSON.stringify({ v: 1, type: 'pong' }));
          return;
        }
        if (data?.topic) {
          if (DEBUG) try { console.debug('[rt] ws recv', { topic: data.topic, type: data.type, keys: Object.keys(data || {}) }); } catch {}
          deliver(data);
        } else {
          if (DEBUG) try { console.debug('[rt] ws recv (no topic)', { type: data?.type, keys: Object.keys(data || {}) }); } catch {}
          deliverFanout(data);
        }
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
      if (DEBUG) try { console.warn('[rt] ws closed, scheduling reconnect', { code: e?.code, reason: e?.reason, delay }); } catch {}
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
    if (topics.length === 0) { setStatus('closed'); return; }
    const url = sseUrlForTopics(topics);
    if (!url) { setStatus('closed'); return; }
    try { esRef.current?.close(); } catch {}
    setStatus('connecting');
    const es = new EventSource(url, { withCredentials: true } as any);
    esRef.current = es;
    es.onopen = () => {
      setStatus('open');
      if (DEBUG) try { console.info('[rt] sse open', { url }); } catch {}
    };
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.topic) {
          if (DEBUG) try { console.debug('[rt] sse recv', { topic: data.topic, type: data.type, keys: Object.keys(data || {}) }); } catch {}
          deliver(data);
        } else {
          if (DEBUG) try { console.debug('[rt] sse recv (no topic)', { type: data?.type, keys: Object.keys(data || {}) }); } catch {}
          deliverFanout(data);
        }
      } catch {}
    };
    es.onerror = () => {
      setStatus('reconnecting');
      setFailureCount((c) => c + 1);
      if (DEBUG) try { console.warn('[rt] sse error; retrying'); } catch {}
      // simple retry
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => openSSE(), 3000);
    };
  }, [sseUrlForTopics, deliver]);

  // Avoid proactive refreshes; rely on cookie-auth WS when possible.
  // If a token is supplied (e.g., from AuthContext), it will be used.

  useEffect(() => {
    // Don’t open any realtime connection until there’s at least one topic
    // or an explicit token for authenticated multiplex usage.
    const hasTopics = subs.current.size > 0;
    if (!hasTopics && !wsToken) { setStatus('closed'); return () => {}; }
    if (mode === 'ws') {
      if (!wsUrl) {
        openSSE();
      } else {
        openWS();
      }
    } else {
      openSSE();
    }
    return () => {
      try { wsRef.current?.close(); } catch {}
      try { esRef.current?.close(); } catch {}
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wsUrl, wsToken]);

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
    // Ensure SSE tracks current topics even if mode is still 'ws' (best-effort fallback active)
    if (mode === 'sse' || esRef.current) {
      refreshSSE();
    }
    if (DEBUG) try { console.info('[rt] subscribe', topic); } catch {}
    return () => {
      const set2 = subs.current.get(topic);
      if (set2) {
        set2.delete(handler);
        if (set2.size === 0) subs.current.delete(topic);
      }
      if (mode === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ v: 1, type: 'unsubscribe', topic })); } catch {}
      }
      if (mode === 'sse' || esRef.current) refreshSSE();
      if (DEBUG) try { console.info('[rt] unsubscribe', topic); } catch {}
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

  // Debug helpers (DevTools)
  useEffect(() => {
    try { __attachRealtimeDebug(mode, status, subs, subscribe, publish, forceReconnect); } catch {}
  }, [mode, status, subscribe, publish, forceReconnect]);

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

// Attach debug helpers each time a hook instance renders
// Provides: window.__rtInfo(), __rtSub(topic), __rtPub(topic, payload), __rtForce()
try {
  // noop – actual assignment happens inside the hook below
} catch {}

// We deliberately place this effect near the end to capture the latest closures
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function __attachRealtimeDebug(
  mode: Mode,
  status: Status,
  subsRef: React.MutableRefObject<Map<string, Set<RealtimeHandler>>>,
  subscribe: (topic: string, handler: RealtimeHandler) => () => void,
  publish: (topic: string, payload: Record<string, any>) => void,
  forceReconnect: () => void,
) {
  if (typeof window === 'undefined') return;
  const W: any = window as any;
  W.__rtInfo = () => ({ mode, status, topics: Array.from(subsRef.current.keys()) });
  W.__rtSub = (topic: string) => subscribe(topic, (msg: any) => console.log('[__rtSub recv]', topic, msg));
  W.__rtPub = (topic: string, payload: any) => publish(topic, { v: 1, ...payload });
  W.__rtForce = () => forceReconnect();
}
