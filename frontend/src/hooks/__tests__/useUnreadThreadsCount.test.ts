import { act, renderHook } from '@testing-library/react';

import useUnreadThreadsCount from '../useUnreadThreadsCount';
import * as api from '@/lib/api';
import * as threadCache from '@/lib/chat/threadCache';
import { useAuth } from '@/contexts/AuthContext';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  getInboxUnread: jest.fn(),
}));

jest.mock('@/lib/chat/threadCache', () => ({
  ...jest.requireActual('@/lib/chat/threadCache'),
  getSummaries: jest.fn(),
  subscribe: jest.fn().mockReturnValue(() => {}),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGetInboxUnread = api.getInboxUnread as jest.MockedFunction<typeof api.getInboxUnread>;
const mockGetSummaries = threadCache.getSummaries as jest.MockedFunction<
  typeof threadCache.getSummaries
>;

describe('useUnreadThreadsCount', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseAuth.mockReturnValue({ user: { id: 1 }, loading: false } as any);
    mockGetSummaries.mockReturnValue([]);
    mockGetInboxUnread.mockResolvedValue({
      status: 200,
      data: { total: 3 },
      headers: {},
    } as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('falls back to server total when cache is empty', async () => {
    const { result } = renderHook(() => useUnreadThreadsCount());

    // Initial value before effects run
    expect(result.current.count).toBe(0);

    // Let initial effects (recompute + syncFromServer) resolve
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(mockGetInboxUnread).toHaveBeenCalled();
    expect(result.current.count).toBe(3);
  });

  it('uses cache-derived sum when summaries exist', async () => {
    mockGetSummaries.mockReturnValue([
      { id: 1, unread_count: 2 },
      { id: 2, unread_count: 5 },
    ] as any);

    const { result } = renderHook(() => useUnreadThreadsCount());

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // 2 + 5 = 7 total unread from cache
    expect(result.current.count).toBe(7);
  });
});
