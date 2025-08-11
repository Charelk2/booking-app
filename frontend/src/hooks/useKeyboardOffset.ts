import { useState, useEffect } from 'react';

/**
 * Returns the height of the on-screen keyboard in pixels if visible.
 * Useful for shifting fixed elements so they remain above the keyboard.
 */
export default function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;

    if (vv) {
      const update = () => {
        const keyboard = window.innerHeight - vv.height - vv.offsetTop;
        setOffset(keyboard > 0 ? keyboard : 0);
      };

      update();
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update, { passive: true });
      return () => {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      };
    }

    // Fallback for browsers without the VisualViewport API
    let baseline = window.innerHeight;
    const updateWin = () => {
      const diff = baseline - window.innerHeight;
      setOffset(diff > 0 ? diff : 0);
    };
    const handleFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        baseline = window.innerHeight;
        window.addEventListener('resize', updateWin);
      }
    };
    const handleFocusOut = () => {
      window.removeEventListener('resize', updateWin);
      setOffset(0);
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('resize', updateWin);
    };
  }, []);

  return offset;
}

