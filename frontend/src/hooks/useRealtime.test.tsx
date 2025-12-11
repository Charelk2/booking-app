import React, { useEffect } from 'react';
import { render } from '@testing-library/react';
import useRealtime from '@/hooks/useRealtime';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols: string | string[] | undefined;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sent: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000, reason: '' } as any);
  }

  static simulateOpenAll() {
    for (const instance of MockWebSocket.instances) {
      instance.readyState = MockWebSocket.OPEN;
      if (instance.onopen) instance.onopen({} as any);
    }
  }
}

describe('useRealtime subscribe/unsubscribe and outbox behaviour', () => {
  const originalWebSocket = (global as any).WebSocket;

  beforeEach(() => {
    (global as any).WebSocket = MockWebSocket as any;
    MockWebSocket.instances.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    (global as any).WebSocket = originalWebSocket;
    jest.useRealTimers();
  });

  function SubscriptionsTest() {
    const { subscribe } = useRealtime(null);
    useEffect(() => {
      const firstUnsub = subscribe('topic-1', () => {});
      const secondUnsub = subscribe('topic-1', () => {});
      (window as any).__rtUnsubs = [firstUnsub, secondUnsub];
    }, [subscribe]);
    return null;
  }

  it('sends one subscribe per topic and one unsubscribe when the last handler detaches', () => {
    render(<SubscriptionsTest />);

    jest.advanceTimersByTime(600);
    MockWebSocket.simulateOpenAll();

    const socket = MockWebSocket.instances[0];
    const frames = socket.sent.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    });

    const subscribeFrames = frames.filter((frame) => frame.type === 'subscribe' && frame.topic === 'topic-1');
    expect(subscribeFrames.length).toBe(1);

    const [firstUnsub, secondUnsub] = (window as any).__rtUnsubs as Array<() => void>;
    secondUnsub();
    firstUnsub();

    const framesAfterUnsub = socket.sent.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    });
    const unsubscribeFrames = framesAfterUnsub.filter(
      (frame) => frame.type === 'unsubscribe' && frame.topic === 'topic-1',
    );
    expect(unsubscribeFrames.length).toBe(1);
  });

  class OutboxWebSocket extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols);
    }
  }

  function OutboxTest() {
    const { publish } = useRealtime(null);
    useEffect(() => {
      for (let index = 0; index < 250; index += 1) {
        publish('topic-outbox', { type: 'test', index });
      }
    }, [publish]);
    return null;
  }

  it('caps the outbox and flushes only the most recent entries when WS opens', () => {
    (global as any).WebSocket = OutboxWebSocket as any;

    render(<OutboxTest />);

    jest.advanceTimersByTime(600);
    OutboxWebSocket.simulateOpenAll();

    const socket = OutboxWebSocket.instances[0];
    const frames = socket.sent.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    });

    const topicFrames = frames.filter((frame) => frame.topic === 'topic-outbox');
    expect(topicFrames.length).toBe(200);

    const indices = topicFrames.map((frame) => frame.index).filter((value) => typeof value === 'number');
    expect(Math.min(...indices)).toBe(50);
    expect(Math.max(...indices)).toBe(249);
  });

  function NoAnonymousTest() {
    // Start with no token; hook should not open WS when allowAnonymous is false
    const { subscribe } = useRealtime(null, { allowAnonymous: false });
    useEffect(() => {
      subscribe('topic-auth', () => {});
    }, [subscribe]);
    return null;
  }

  it('does not open WS when allowAnonymous=false and no token is provided', () => {
    render(<NoAnonymousTest />);
    jest.advanceTimersByTime(600);
    expect(MockWebSocket.instances.length).toBe(0);
  });

  function TokenAppearTest() {
    const [tok, setTok] = React.useState<string | null>(null);
    const { subscribe } = useRealtime(tok, { allowAnonymous: false });
    useEffect(() => {
      subscribe('topic-auth', () => {});
    }, [subscribe]);
    useEffect(() => {
      setTok('test-token');
    }, []);
    return null;
  }

  it('restarts WS with bearer protocol when token becomes available', () => {
    render(<TokenAppearTest />);
    // allow state effect to run and openWS delay (500ms)
    jest.advanceTimersByTime(600);
    // Socket should be created with bearer subprotocol
    expect(MockWebSocket.instances.length).toBe(1);
    const socket = MockWebSocket.instances[0];
    expect(socket.protocols).toEqual(['bearer', 'test-token']);
  });
});
