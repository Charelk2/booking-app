import { useState, useRef, useEffect } from 'react';

/**
 * useThrottle limits how frequently a changing value triggers updates.
 * It emits the latest value at most once per `delay` milliseconds,
 * which helps avoid expensive side effects like autosaving on every keystroke.
 */
export function useThrottle<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef<number>(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      setThrottledValue(value);
      lastRan.current = Date.now();
    }, Math.max(delay - (Date.now() - lastRan.current), 0));

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return throttledValue;
}
