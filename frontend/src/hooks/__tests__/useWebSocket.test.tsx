import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React, { useEffect } from 'react';
import useWebSocket from '../useWebSocket';

// Simple WebSocket stub
class StubSocket {
  static instances: StubSocket[] = [];
  static last: StubSocket | null = null;

  url: string;

  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((e?: CloseEvent) => void) | null = null;
  send = jest.fn();
  close() {}

  constructor(url: string) {
    this.url = url;
    StubSocket.instances.push(this);
    StubSocket.last = this;
  }
}
// @ts-expect-error jsdom does not implement WebSocket
global.WebSocket = StubSocket;

describe('useWebSocket', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    StubSocket.instances = [];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('reconnects with exponential backoff', () => {
    jest.useFakeTimers();
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    function Test() {
      useWebSocket('ws://test');
      return null;
    }

    act(() => {
      root.render(<Test />);
    });

    expect(StubSocket.instances.length).toBe(1);
    const first = StubSocket.instances[0];

    act(() => {
      first.onclose?.();
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(StubSocket.instances.length).toBe(2);
    const second = StubSocket.instances[1];

    act(() => {
      second.onclose?.();
    });

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(StubSocket.instances.length).toBe(3);

    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it('invokes onError when the socket closes', () => {
    jest.useFakeTimers();

    const onError = jest.fn();

    function Test() {
      useWebSocket('ws://test', onError);
      return null;
    }

    act(() => {
      root.render(<Test />);
    });

    const first = StubSocket.instances[0];

    act(() => {
      first.onclose?.();
    });

    expect(onError).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('stops reconnecting when close code is 4401', () => {
    jest.useFakeTimers();

    function Test() {
      useWebSocket('ws://test');
      return null;
    }

    act(() => {
      root.render(<Test />);
    });

    expect(StubSocket.instances.length).toBe(1);
    const first = StubSocket.instances[0];

    act(() => {
      first.onclose?.({ code: 4401 } as CloseEvent);
    });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(StubSocket.instances.length).toBe(1);

    jest.useRealTimers();
  });

  it('does not connect when url is null', () => {
    function Test() {
      // explicitly pass null to skip connection
      useWebSocket(null);
      return null;
    }

    act(() => {
      root.render(<Test />);
    });

    expect(StubSocket.instances.length).toBe(0);
  });

  it('responds to ping and batches presence updates', () => {
    jest.useFakeTimers();

    function Test() {
      const { onMessage, updatePresence } = useWebSocket('ws://test');
      useEffect(() => onMessage(() => {}), [onMessage]);
      useEffect(() => {
        updatePresence(1, 'online');
        updatePresence(2, 'away');
      }, [updatePresence]);
      return null;
    }

    act(() => {
      root.render(<Test />);
    });

    const socket = StubSocket.last!;
    act(() => {
      socket.onopen?.();
    });
    socket.send.mockClear();

    act(() => {
      socket.onmessage?.({ data: JSON.stringify({ type: 'ping' }) } as MessageEvent);
    });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ v: 1, type: 'pong' }));
    socket.send.mockClear();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ v: 1, type: 'presence', updates: { 1: 'online', 2: 'away' } }),
    );

    jest.useRealTimers();
  });
});
