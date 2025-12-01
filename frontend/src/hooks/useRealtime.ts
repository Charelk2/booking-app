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
// Do not pre-normalize WS_BASE_ENV here beyond trimming
WS_BASE_ENV = (WS_BASE_ENV || '').trim();

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
  const connectingRef = useRef(false);
  // Track how long a connection stayed open; treat sub‑5s uptimes as failures
  const openedAtRef = useRef<number | null>(null);
  const subs = useRef<Map<string, Set<RealtimeHandler>>>(new Map());
  // Outbox for best-effort publishes while socket is not open or when in SSE fallback
  const outboxRef = useRef<Array<{ topic: string; payload: any }>>([]);
  const pendingSubTopics = useRef<Set<string>>(new Set());
  const [wsToken, setWsToken] = useState<string | null>(token ?? null);
  const [refreshAttempted, setRefreshAttempted] = useState(false);
  useEffect(() => { setWsToken(token ?? null); }, [token]);
  // Keep last non-empty token to avoid flipping WS URL between with/without token
  const lastTokenRef = useRef<string | null>(null);
  useEffect(() => {
    const t = (token || '').trim();
    if (t) lastTokenRef.current = t;
  }, [token]);

  const wsUrl = useMemo(() => {
    // Build a robust WS URL that never produces a relative path like
    // "api.booka.co.za/api/v1/ws" which browsers would resolve against the current origin.
    const build = (): string | null => {
      const raw = (WS_BASE_ENV || '').trim();
      const appendDefaultPath = (u: URL) => {
        if (!u.pathname || u.pathname === '/' || u.pathname === '') u.pathname = '/api/v1/ws';
        return u;
      };
      try {
        if (raw) {
          if (/^wss?:\/\//i.test(raw)) {
            const u = new URL(raw);
            appendDefaultPath(u);
            // Ensure ws/wss protocol
            if (!/^wss?:$/i.test(u.protocol)) u.protocol = u.protocol.startsWith('https') ? 'wss:' : 'ws:';
            return u.toString();
          }
          if (/^https?:\/\//i.test(raw)) {
            const u = new URL(raw);
            appendDefaultPath(u);
            u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
            return u.toString();
          }
          // Scheme-less host or host+path provided → assume wss and normalize
          const guess = new URL(`wss://${raw.replace(/^\/+/, '')}`);
          appendDefaultPath(guess);
          return guess.toString();
        }
      } catch {
        // fall through to window.location
      }
      if (typeof window !== 'undefined' && window.location) {
        const loc = window.location;
        const u = new URL(loc.origin);
        u.protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        u.pathname = '/api/v1/ws';
        return u.toString();
      }
      return null;
    };
    const base = build();
    if (!base) return null;
    // Allow opening even without a token; servers can authenticate via cookies.
    // Previously we blocked cross-origin opens without a token, which prevented
    // reconnect after a hard refresh when AuthContext had not yet restored the
    // in-memory token (despite valid auth cookies). We now always provide a URL
    // and rely on subprotocols or cookies when available.
    // Do not attach tokens in the URL; authenticate via cookies.
    try {
      const u = new URL(base);
      return u.toString();
    } catch {
      return base;
    }
  }, [wsToken]);

  const sseUrlForTopics = useCallback((topics: string[]) => {
    const qs = new URLSearchParams();
    if (topics.length) qs.set('topics', topics.join(','));
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
    if (connectingRef.current || wsRef.current) return;
    if (pingTimer.current) { try { clearInterval(pingTimer.current); } catch {} pingTimer.current = null; }
    setStatus(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    connectingRef.current = true;
    // Prefer bearer via subprotocol; fall back to cookies if present
    const bearerToken = (wsToken || '').trim();
    const protocols = bearerToken ? ['bearer', bearerToken] : undefined;
    const ws = protocols ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      // Mark open time; do not reset attempts immediately - only after a
      // stable open (see onclose schedule below). This prevents infinite
      // open→close flapping from forever avoiding SSE fallback.
      openedAtRef.current = Date.now();
      lastDelayRef.current = null;
      connectingRef.current = false;
      setStatus('open');
      // Reset attempts after a short stability window to avoid fast flap loops
      try { setTimeout(() => { attemptsRef.current = 0; }, 5000); } catch {}
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
        // Ignore reconnect hints from server; client manages its own backoff/stability.
        if (data?.type === 'reconnect_hint') {
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
      connectingRef.current = false;
      wsRef.current = null;
      // If the socket closed soon after opening, count it as a failure toward
      // SSE fallback. Only consider an open "stable" if it lived >= 10s.
      const uptimeMs = openedAtRef.current ? (Date.now() - openedAtRef.current) : 0;
      if (uptimeMs >= 10000) {
        // Stable connection - reset failure streak
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
            try { console.warn('[realtime] WS unauthorized (4401) - coordinating refresh'); } catch {}
            await mod.ensureFreshAccess();
            attemptsRef.current = 0;
            setStatus('reconnecting');
            openWS();
            return;
          } catch {}
          // If refresh fails, keep closed; do not use SSE fallback
          setStatus('closed');
        })();
        return;
      }
      // If not already incremented above (stable close), ensure counters reflect a failure
      setFailureCount((c) => c + 1);
      const attempt = Math.max(0, attemptsRef.current);
      const baseSec = Math.min(30, 2 ** attempt);
      const jitterMultiplier = 0.8 + Math.random() * 0.4; // 0.8x–1.2x
      const delay = Math.floor(baseSec * jitterMultiplier * 1000);
      lastDelayRef.current = delay;
      setStatus('reconnecting');
      try { console.warn('[realtime] WS closed, scheduling reconnect', { code: e?.code, reason: e?.reason, delay }); } catch {}
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        // Keep retrying WS; SSE fallback disabled
        openWS();
      }, delay);
    };
    ws.onerror = (err) => {
      // Some environments emit transient error events without a meaningful reason.
      // Avoid forcing an immediate additional close/schedule cycle here; onclose
      // will handle backoff scheduling. This reduces thrash seen as rapid
      // unsubscribe/subscribe loops in StrictMode or flaky networks.
      try { console.error('[realtime] WS error', err); } catch {}
    };
    ws.onclose = schedule;
  }, [wsUrl, deliver, wsToken]);

  // SSE fallback is disabled for now to avoid proxy/404 churn
  const openSSE = useCallback(() => {
    setStatus('closed');
  }, []);

  // Avoid proactive refreshes; rely on cookie-auth WS when possible.
  // If a token is supplied (e.g., from AuthContext), it will be used.
  // Make this effect idempotent: only (re)open when URL changes or when there is no active socket.
  const lastUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const hasTopics = subs.current.size > 0;
    if (!hasTopics || !wsUrl) { setStatus('closed'); return; }
    const state = wsRef.current?.readyState;
    const openOrConnecting = state === WebSocket.OPEN || state === WebSocket.CONNECTING;
    if ((openOrConnecting || connectingRef.current) && lastUrlRef.current === wsUrl) {
      // Already open to the same URL
      return;
    }
    // If URL changed while a socket exists, close and reopen after a tiny delay to avoid thrash
    if (wsRef.current && lastUrlRef.current && lastUrlRef.current !== wsUrl) {
      try { wsRef.current.close(); } catch {}
    }
    lastUrlRef.current = wsUrl;
    // Gentle delay to avoid racing with heavy first-paint API calls
    const id = setTimeout(() => { openWS(); }, 500);
    return () => { try { clearTimeout(id); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  // Close transports on unmount
  useEffect(() => () => {
    try { wsRef.current?.close(); } catch {}
    try { esRef.current?.close(); } catch {}
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    if (pingTimer.current) { try { clearInterval(pingTimer.current); } catch {} pingTimer.current = null; }
  }, []);

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
    // SSE disabled; no refresh when topics change
    // If we just added the first topic and the transport isn't open yet, open it now.
    try {
      const topicCount = subs.current.size;
      if (topicCount > 0) {
        const state = wsRef.current?.readyState;
        const openOrConnecting = state === WebSocket.OPEN || state === WebSocket.CONNECTING;
        if (!openOrConnecting && !connectingRef.current) {
          try { console.info('[realtime] opening WS after subscribe (topics:', topicCount, ')'); } catch {}
          if (wsUrl) openWS();
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
      // SSE disabled; do nothing here
      if (DEBUG) try { console.info('[rt] unsubscribe', topic); } catch {}
    };
  }, [openWS, wsUrl, DEBUG]);

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
