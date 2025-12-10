import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { useThreadRealtime } from './useThreadRealtime';

const mockSubscribe = jest.fn((topic: string, handler: (evt: any) => void) => {
  (mockSubscribe as any).lastHandler = handler;
  return jest.fn();
});

const mockPublish = jest.fn();
const mockPutDeliveredUpTo = jest.fn();

jest.mock('@/contexts/chat/RealtimeContext', () => ({
  useRealtimeContext: () => ({
    mode: 'ws',
    status: 'open',
    lastReconnectDelay: null,
    failureCount: 0,
    subscribe: mockSubscribe,
    publish: mockPublish,
    forceReconnect: jest.fn(),
  }),
}));

jest.mock('@/lib/api', () => ({
  __esModule: true,
  putDeliveredUpTo: (...args: any[]) => mockPutDeliveredUpTo(...args),
}));

function DeliveredAcksTest() {
  useThreadRealtime({
    threadId: 123,
    isActive: true,
    myUserId: 1,
    ingestMessage: jest.fn(),
    applyReadReceipt: jest.fn(),
    applyDelivered: jest.fn(),
    pokeDelta: jest.fn(),
  });
  return null;
}

describe('useThreadRealtime delivered ack debounce', () => {
  beforeEach(() => {
    mockSubscribe.mockClear();
    mockPublish.mockClear();
    mockPutDeliveredUpTo.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces delivered acknowledgements and sends max id once', async () => {
    render(<DeliveredAcksTest />);

    const handler = (mockSubscribe as any).lastHandler as ((evt: any) => void);
    expect(typeof handler).toBe('function');

    await act(async () => {
      handler({
        type: 'message',
        payload: { message: { id: 10, sender_id: 2 } },
      });
      handler({
        type: 'message',
        payload: { message: { id: 20, sender_id: 2 } },
      });
      handler({
        type: 'message',
        payload: { message: { id: 15, sender_id: 2 } },
      });

      jest.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(mockPutDeliveredUpTo).toHaveBeenCalledTimes(1);
    expect(mockPutDeliveredUpTo).toHaveBeenCalledWith(123, 20);
  });
});
