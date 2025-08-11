import { renderHook, act } from '@testing-library/react';
import useOfflineQueue from '../useOfflineQueue';

describe('useOfflineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries with exponential backoff', async () => {
    let attempt = 0;
    const process = jest.fn(async () => {
      attempt += 1;
      if (attempt < 2) {
        throw new Error('fail');
      }
    });
    const timeoutSpy = jest.spyOn(global, 'setTimeout');
    const { result } = renderHook(() => useOfflineQueue('testQueue', process));

    act(() => {
      result.current.enqueue({ foo: 'bar' });
    });
    await Promise.resolve();
    expect(process).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await Promise.resolve();

    expect(process).toHaveBeenCalledTimes(2);
    timeoutSpy.mockRestore();
  });
});
