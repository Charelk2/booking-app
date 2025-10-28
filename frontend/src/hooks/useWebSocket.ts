import { useCallback, useEffect, useRef, useState } from 'react';

export type MessageHandler = (event: MessageEvent) => void;

type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface UseWebSocketReturn {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  onMessage: (handler: MessageHandler) => () => void;
  updatePresence: (userId: number, status: string) => void;
  status: SocketStatus;
  forceReconnect: () => void;
  lastReconnectDelay: number | null;
}

/**
 * Establishes a WebSocket connection and automatically reconnects using
 * exponential backoff when disconnected. Consumers can send data and
 * subscribe to message events.
 */
export type ErrorHandler = (event?: CloseEvent) => void;

export default function useWebSocket(
  url?: string | null,
  onError?: ErrorHandler,
): UseWebSocketReturn {
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler[]>([]);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presenceBuffer = useRef<Map<number, string>>(new Map());
  const presenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPresenceUser = useRef<number | null>(null);
  const [status, setStatus] = useState<SocketStatus>('closed');
  const lastReconnectDelayRef = useRef<number | null>(null);

  const send = useCallback<UseWebSocketReturn['send']>((data) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(data);
    }
  }, []);

  const onMessage = useCallback<UseWebSocketReturn['onMessage']>((handler) => {
    handlersRef.current.push(handler);
    return () => {
      handlersRef.current = handlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  const flushPresence = useCallback(() => {
    const updates: Record<number, string> = {};
    presenceBuffer.current.forEach((status, id) => {
      updates[id] = status;
    });
    presenceBuffer.current.clear();
    presenceTimer.current = null;
    try {
      send(JSON.stringify({ v: 1, type: 'presence', updates }));
    } catch {
      /* ignore */
    }
  }, [send]);

  const updatePresence = useCallback<UseWebSocketReturn['updatePresence']>(
    (userId, status) => {
      lastPresenceUser.current = userId;
      presenceBuffer.current.set(userId, status);
      if (!presenceTimer.current) {
        presenceTimer.current = window.setTimeout(flushPresence, 1000);
      }
    },
    [flushPresence],
  );

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      // Close any existing socket before establishing a new connection to
      // prevent accumulating open sockets in the browser.
      if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
        try {
          socketRef.current.close();
        } catch {
          /* ignore */
        }
      }

      setStatus(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        lastReconnectDelayRef.current = null;
        setStatus('open');
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const base = isMobile ? 60 : 30;
        try {
          ws.send(JSON.stringify({ v: 1, type: 'heartbeat', interval: base }));
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data?.type === 'ping') {
            ws.send(JSON.stringify({ v: 1, type: 'pong' }));
            return;
          }
        } catch {
          /* ignore */
        }
        handlersRef.current.forEach((h) => h(e));
      };

      const scheduleReconnect = (e?: CloseEvent) => {
        if (cancelled) return;
        if (e?.code === 4401) {
          // Try to refresh token and reconnect once with updated URL
          (async () => {
            try {
              const res = await fetch('/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
              if (res.ok) {
                const body = await res.json().catch(() => null);
                const at = body?.access_token as string | undefined;
                if (at && at.trim()) {
                  try {
                    const u = new URL(url);
                    const qs = new URLSearchParams(u.search || '');
                    qs.set('token', at);
                    const nextUrl = `${u.origin}${u.pathname}?${qs.toString()}`;
                    // Immediate reconnect with fresh token
                    if (timerRef.current) window.clearTimeout(timerRef.current);
                    attemptsRef.current = 0;
                    setStatus('reconnecting');
                    cancelled = false;
                    // Recurse by calling connect with new URL
                    // Close existing just in case
                    try { socketRef.current?.close(); } catch {}
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const _ = nextUrl; // keep reference for closure
                    // Re-init by creating a new WebSocket with nextUrl
                    const ws2 = new WebSocket(nextUrl);
                    socketRef.current = ws2;
                    ws2.onopen = ws.onopen;
                    ws2.onmessage = ws.onmessage;
                    ws2.onerror = ws.onerror;
                    ws2.onclose = ws.onclose as any;
                    return;
                  } catch { /* fall through */ }
                }
              }
            } catch { /* refresh failed */ }
            if (onError) onError(e);
            setStatus('closed');
          })();
          return;
        }
        if (onError) onError(e);
        attemptsRef.current += 1;
        // Exponential backoff with jitter
        const raw = Math.min(30000, 1000 * 2 ** (attemptsRef.current - 1));
        const jitter = Math.floor(Math.random() * 300);
        const delay = raw + jitter;
        lastReconnectDelayRef.current = delay;
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(connect, delay);
        setStatus('reconnecting');
      };

      ws.onerror = () => {
        // Ensure the socket is closed before scheduling a reconnect. This helps
        // avoid lingering connections that can trigger "Insufficient resources"
        // errors in some browsers.
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        scheduleReconnect();
      };
      ws.onclose = scheduleReconnect;
    };

    const handleVisibility = () => {
      if (!socketRef.current) return;
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const base = isMobile ? 60 : 30;
      const interval = document.hidden ? base * 2 : base;
      try {
        socketRef.current.send(
          JSON.stringify({ type: 'heartbeat', interval }),
        );
      } catch {
        /* ignore */
      }
      if (lastPresenceUser.current !== null) {
        updatePresence(
          lastPresenceUser.current,
          document.hidden ? 'away' : 'online',
        );
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    connect();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [url, onError]);

  const forceReconnect = useCallback(() => {
    try {
      if (socketRef.current) socketRef.current.close();
    } catch {}
  }, []);

  return { send, onMessage, updatePresence, status, forceReconnect, lastReconnectDelay: lastReconnectDelayRef.current };
}
