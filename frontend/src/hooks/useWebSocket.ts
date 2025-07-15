import { useCallback, useEffect, useRef } from 'react';

export type MessageHandler = (event: MessageEvent) => void;

interface UseWebSocketReturn {
  send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
  onMessage: (handler: MessageHandler) => () => void;
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

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
      };

      ws.onmessage = (e) => {
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
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => scheduleReconnect();
      ws.onclose = scheduleReconnect;
    };

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [url, onError]);

  return { send, onMessage };
}
