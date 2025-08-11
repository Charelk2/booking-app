import { useCallback, useEffect, useRef } from 'react';

export type MessageHandler = (event: MessageEvent) => void;

interface UseWebSocketReturn {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  onMessage: (handler: MessageHandler) => () => void;
  updatePresence: (userId: number, status: string) => void;
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const presenceBuffer = useRef<Map<number, string>>(new Map());
  const presenceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastPresenceUser = useRef<number | null>(null);

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
      send(JSON.stringify({ type: 'presence', updates }));
    } catch {
      /* ignore */
    }
  }, [send]);

  const updatePresence = useCallback<UseWebSocketReturn['updatePresence']>(
    (userId, status) => {
      lastPresenceUser.current = userId;
      presenceBuffer.current.set(userId, status);
      if (!presenceTimer.current) {
        presenceTimer.current = setTimeout(flushPresence, 1000);
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

      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const base = isMobile ? 60 : 30;
        try {
          ws.send(JSON.stringify({ type: 'heartbeat', interval: base }));
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data?.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
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
          if (onError) onError(e);
          cancelled = true;
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          return;
        }
        if (onError) onError(e);
        attemptsRef.current += 1;
        const delay = Math.min(30000, 1000 * 2 ** (attemptsRef.current - 1));
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(connect, delay);
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
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [url, onError]);

  return { send, onMessage, updatePresence };
}
