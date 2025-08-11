import { useEffect } from 'react';

/**
 * Detect clicks that occur outside of the provided element(s) and invoke a handler.
 *
 * Accepts either a single ref or an array of refs. If the event target is contained
 * within *any* of the supplied refs, the handler will not be called. This allows
 * components that render popups via `createPortal` to treat both the trigger and
 * the portal content as "inside" clicks.
 */
export default function useClickOutside(
  refs: React.RefObject<HTMLElement | null> | React.RefObject<HTMLElement | null>[],
  handler: () => void,
) {
  useEffect(() => {
    const refArray = Array.isArray(refs) ? refs : [refs];

    const listener = (event: MouseEvent | TouchEvent) => {
      if (refArray.some((ref) => ref.current && ref.current.contains(event.target as Node))) {
        return;
      }
      handler();
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener, { passive: true });

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [refs, handler]);
}
