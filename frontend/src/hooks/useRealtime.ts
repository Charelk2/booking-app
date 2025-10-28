import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushTransportQueue } from '@/lib/transportState';

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
// Prefer explicit WS URL. If not provided, fall back to API URL origin.
let WS_BASE_ENV = (process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || '') as string;
// Prefer directing SSE to the API origin to avoid proxy buffering/closures
let SSE_BASE_ENV = (process.env.NEXT_PUBLIC_SSE_URL || process.env.NEXT_PUBLIC_API_URL || '') as string;
// Reduce full API URL to origin since WS endpoint path is fixed under /api/v1/ws
try {
  if (WS_BASE_ENV) {
    const u = new URL(WS_BASE_ENV);
    WS_BASE_ENV = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  }
} catch {
  // Keep as-is if not a valid URL (e.g., empty)
}
WS_BASE_ENV = WS_BASE_ENV.replace(/\/+$/, '');

try {
  if (SSE_BASE_ENV) {
    const u = new URL(SSE_BASE_ENV);
    SSE_BASE_ENV = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
  }
} catch {
  // noop
}
SSE_BASE_ENV = SSE_BASE_ENV.replace(/\/+$/, '');

export default function useRealtime(token?: string | null): UseRealtimeReturn {
  const DEBUG = typeof window !== 'undefined' && (localStorage.getItem('CHAT_DEBUG') === '1');
  const [mode, setMode] = useState<Mode>('ws');
  const [status, setStatus] = useState<Status>('closed');
  const [failureCount, setFailureCount] = useState(0);
  const lastDelayRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<any>(null);
  const pingTimer = useRef<any>(null);
  const attemptsRef = useRef(0);
  // Track how long a connection stayed open; treat sub‑5s uptimes as failures
  const openedAtRef = useRef<number | null>(null);
  const subs = useRef<Map<string, Set<RealtimeHandler>>>(new Map());
  // Outbox for best-effort publishes while socket is not open or when in SSE fallback
  const outboxRef = useRef<Array<{ topic: string; payload: any }>>([]);
  const pendingSubTopics = useRef<Set<string>>(new Set());
  const [wsToken, setWsToken] = useState<string | null>(token ?? null);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  useEffect(() => { setWsToken(token ?? null); }, [token]);

  const wsBase = useMemo(() => {
    // If an explicit WS (or API) base is configured, prefer it — avoids Next dev server WS proxy issues
    if (WS_BASE_ENV) return WS_BASE_ENV.replace(/^http/, 'ws');
    if (typeof window !== 'undefined') return window.location.origin.replace(/^http/, 'ws');
    return '';
  }, []);

  const wsUrl = useMemo(() => {
    if (!wsBase) return null;
    // Prefer token when available; otherwise rely on HttpOnly cookie for same-site/subdomain
    const q = wsToken ? `?token=${encodeURIComponent(wsToken)}` : '';
    return `${wsBase}/api/v1/ws${q}`;
  }, [wsBase, wsToken]);

  const sseUrlForTopics = useCallback((topics: string[]) => {
    const qs = new URLSearchParams();
    if (topics.length) qs.set('topics', topics.join(','));
    if (token) qs.set('token', token);
    // Prefer API origin; fall back to same-origin only if not configured
    const base = SSE_BASE_ENV;
    return base ? `${base}/api/v1/sse?${qs.toString()}` : `/api/v1/sse?${qs.toString()}`;
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
    if (pingTimer.current) { try { clearInterval(pingTimer.current); } catch {} pingTimer.current = null; }
    setStatus(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      // Mark open time; do not reset attempts immediately — only after a
      // stable open (see onclose schedule below). This prevents infinite
      // open→close flapping from forever avoiding SSE fallback.
      openedAtRef.current = Date.now();
      lastDelayRef.current = null;
      setStatus('open');
      // Flush queued HTTP tasks (message sends, etc.) when WS is healthy
      try { flushTransportQueue(); } catch {}
      try { console.info('[realtime] WS open', { url: wsUrl }); } catch {}
      // Flush any pending publishes
      try {
        const q = outboxRef.current;
        outboxRef.current = [];
        for (const item of q) {
          try { ws.send(JSON.stringify({ v: 1, topic: item.topic, ...item.payload })); } catch {}
        }
      } catch {}
      // Heartbeat
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const base = isMobile ? 60 : 30;
      try { ws.send(JSON.stringify({ v: 1, type: 'heartbeat', interval: base })); } catch {}
      // Client-side keepalive ping to placate proxies that idle-close quiet sockets
      try {
        if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null; }
        // Send a small ping every 25s (Cloudflare/edge-friendly); server may ignore
        pingTimer.current = setInterval(() => {
          try { ws.send(JSON.stringify({ v: 1, type: 'ping' })); } catch {}
        }, 25000);
      } catch {}
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
      try { console.warn('[realtime] WS closed', { code: e?.code, reason: e?.reason }); } catch {}
      if (pingTimer.current) { try { clearInterval(pingTimer.current); } catch {} pingTimer.current = null; }
      // If the socket closed soon after opening, count it as a failure toward
      // SSE fallback. Only consider an open "stable" if it lived >= 10s.
      const uptimeMs = openedAtRef.current ? (Date.now() - openedAtRef.current) : 0;
      if (uptimeMs >= 10000) {
        // Stable connection — reset failure streak
        attemptsRef.current = 0;
      } else {
        // Flap: increase failure streak so we can switch to SSE quickly
        attemptsRef.current += 1;
      }
      openedAtRef.current = null;
      if (e?.code === 4401) {
        // Unauthorized – coordinate refresh with the global refresh coordinator, then reconnect once
        (async () => {
          try {
            const mod = await import('@/lib/refreshCoordinator');
            try { console.warn('[realtime] WS unauthorized (4401) — coordinating refresh'); } catch {}
            await mod.ensureFreshAccess();
            attemptsRef.current = 0;
            setStatus('reconnecting');
            openWS();
            return;
          } catch {}
          // If refresh fails, fall back to SSE to keep realtime limping
          setMode('sse');
          setStatus('connecting');
          try { console.warn('[realtime] Refresh failed; falling back to SSE'); } catch {}
          openSSE();
        })();
        return;
      }
      // If not already incremented above (stable close), ensure counters reflect a failure
      setFailureCount((c) => c + 1);
      const raw = Math.min(30000, 1000 * 2 ** (attemptsRef.current - 1));
      const jitter = Math.floor(Math.random() * 300);
      const delay = raw + jitter;
      lastDelayRef.current = delay;
      setStatus('reconnecting');
      try { console.warn('[realtime] WS closed, scheduling reconnect', { code: e?.code, reason: e?.reason, delay }); } catch {}
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        // Fallback to SSE after 3 short‑lived failures or closes
        if (attemptsRef.current >= 3) {
          setMode('sse');
          setStatus('connecting');
          try { console.warn('[realtime] Too many WS failures; switching to SSE'); } catch {}
          openSSE();
        } else {
          openWS();
        }
      }, delay);
    };
    ws.onerror = (err) => { try { console.error('[realtime] WS error', err); } catch {} try { ws.close(); } catch {} schedule(); };
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
      try { console.info('[realtime] SSE open', { url }); } catch {}
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
    es.onerror = (ev) => {
      setStatus('reconnecting');
      setFailureCount((c) => c + 1);
      try { console.warn('[realtime] SSE error; retrying', ev); } catch {}
      // simple retry
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => openSSE(), 3000);
    };
  }, [sseUrlForTopics, deliver]);

  // Avoid proactive refreshes; rely on cookie-auth WS when possible.
  // If a token is supplied (e.g., from AuthContext), it will be used.

  useEffect(() => {
    // Don’t open any realtime connection until there’s at least one topic
    const hasTopics = subs.current.size > 0;
    if (!hasTopics) { setStatus('closed'); return () => {}; }
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
      if (pingTimer.current) { try { clearInterval(pingTimer.current); } catch {} pingTimer.current = null; }
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
    if (mode === 'sse' || esRef.current) { refreshSSE(); }
    // If we just added the first topic and the transport isn't open yet, open it now.
    try {
      const topicCount = subs.current.size;
      if (topicCount > 0) {
        if (mode === 'ws') {
          const state = wsRef.current?.readyState;
          const openOrConnecting = state === WebSocket.OPEN || state === WebSocket.CONNECTING;
          if (!openOrConnecting) {
            try { console.info('[realtime] opening WS after subscribe (topics:', topicCount, ')'); } catch {}
            if (!wsBase || !wsUrl) openSSE(); else openWS();
          }
        } else {
          const esOpen = !!esRef.current;
          if (!esOpen) {
            try { console.info('[realtime] opening SSE after subscribe (topics:', topicCount, ')'); } catch {}
            openSSE();
          }
        }
      }
    } catch {}
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
  }, [mode, refreshSSE, openWS, openSSE, wsBase, wsUrl]);

  const publish = useCallback((topic: string, payload: Record<string, any>) => {
    // If WS is open, send immediately
    if (mode === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ v: 1, topic, ...payload })); } catch {}
      return;
    }
    // Otherwise, queue and attempt to open WS so the event eventually goes out.
    try { outboxRef.current.push({ topic, payload }); } catch {}
    // Try to open WS if possible; else SSE will keep receiving while we retry
    if (wsUrl) openWS();
  }, [mode, openWS, wsUrl]);

  const forceReconnect = useCallback(() => {
    if (mode === 'ws') {
      try { wsRef.current?.close(); } catch {}
      openWS();
    } else {
      openSSE();
    }
  }, [mode, openWS, openSSE]);

  // Adjust heartbeat interval when tab visibility changes (match legacy behavior)
  useEffect(() => {
    const onVisibility = () => {
      try {
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const base = isMobile ? 60 : 30;
        const interval = document.hidden ? base * 2 : base;
        const ws = wsRef.current;
        if (mode === 'ws' && ws && ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ v: 1, type: 'heartbeat', interval })); } catch {}
        }
      } catch {}
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      try { if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility); } catch {}
    };
  }, [mode]);

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
