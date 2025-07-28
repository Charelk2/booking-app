// /hooks/useSafeReset.ts
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useSafeReset(resetFn: () => void) {
  const router = useRouter();

  useEffect(() => {
    return () => {
      resetFn(); // run cleanup on unmount
    };
  }, [resetFn]);

  return resetFn;
}
