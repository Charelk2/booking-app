import { createRoot } from 'react-dom/client';
import { act } from 'react';
import React from 'react';
import useWebSocket from '../useWebSocket';

// Simple WebSocket stub
class StubSocket {
  static instances: StubSocket[] = [];
  static last: StubSocket | null = null;

  url: string;

  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
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
});
