import { act } from 'react';

export async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
  if (jest.isMockFunction(setTimeout)) {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  }
}

