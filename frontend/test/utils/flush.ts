import { act } from 'react';
export async function flushPromises() {
  await act(async () => { await Promise.resolve(); });
  if (typeof jest !== 'undefined' && jest.isMockFunction(setTimeout)) {
    act(() => { jest.runOnlyPendingTimers(); });
  }
}
