import { act } from 'react';

export async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function nextTick() {
  await Promise.resolve();
}

