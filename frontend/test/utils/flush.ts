import { act } from 'react';

export async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
  // If fake timers are active, run pending timers once
  if (jest?.isMockFunction?.(setTimeout)) {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  }
}

