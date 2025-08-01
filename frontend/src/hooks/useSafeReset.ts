// /hooks/useSafeReset.ts
import { useEffect } from 'react';

export function useSafeReset(resetFn: () => void) {

  useEffect(() => {
    return () => {
      resetFn(); // run cleanup on unmount
    };
  }, [resetFn]);

  return resetFn;
}
